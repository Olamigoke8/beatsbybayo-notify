#!/usr/bin/env python3
"""BeatsByBayo — notification backend.

Receives inquiry submissions from the public booking form, stores them in
SQLite, fires owner notifications (email via Resend + Telegram message),
sends a friendly auto-reply to the client, and exposes a password-protected
admin dashboard with booked-date tracking.

Run:
  ADMIN_PASSWORD=... python3 -m uvicorn app:app --host 0.0.0.0 --port 8000

Secrets (Resend key, Telegram bot token, chat_id) live in secrets.json next
to this file. For production, set them as env vars instead (see README).
"""
import os
import json
import sqlite3
import threading
import hashlib
import secrets
from collections import defaultdict, deque
from time import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "change-me")
RESEND_HOST = "https://api.resend.com"

# When a sending domain is verified in Resend, set FROM_EMAIL to e.g.
# "Bayo <bayo@beatsbybayo.com>" — this enables branded email AND auto-reply
# delivery to clients. Until then the test sender only delivers to the
# Resend account owner email.
FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "BeatsByBayo <onboarding@resend.dev>")

OWNER_EMAIL = os.environ.get("OWNER_EMAIL", "beatsbybayo@gmail.com")
OWNER_PHONE = os.environ.get("OWNER_PHONE", "(704) 704-2179")
WHATSAPP_LINK = "https://wa.me/17047042179"

# Full real pricing — admin-only. NEVER shipped in the public static bundle.
PRICING = {
    "retainer": {"label": "Non-refundable deposit", "amount": 200, "note": "Save your date in advance"},
    "packages": [
        {"id": "basic", "name": "Basic", "price": 899, "hours": 4, "includes": "DJ + professional sound system + wireless microphones"},
        {"id": "signature", "name": "Signature", "price": 1500, "hours": 5, "includes": "Full event DJ + pro sound + dance-floor lighting + event setup"},
        {"id": "premium", "name": "Premium", "price": 2500, "hours": 6, "includes": "DJ + backup setup + dance-floor lighting + uplighting + crowd-reading transitions"},
    ],
    "addons": [
        {"id": "extra_hour", "name": "Extra hour", "price": 225, "note": "Per extra hour"},
        {"id": "ceremony_sound", "name": "Ceremony sound", "price": 350, "note": "Plus hourly rate"},
        {"id": "uplighting", "name": "Uplighting", "price": 350},
        {"id": "dance_floor_light", "name": "Dance-floor lighting", "price": 250},
        {"id": "wireless_mic", "name": "Additional wireless mic", "price": 50},
        {"id": "dancing_on_clouds", "name": "Dancing on the clouds", "price": 400, "admin_only": True},
        {"id": "premium_dance_lighting", "name": "Premium dance-floor lighting", "price": 600, "admin_only": True},
    ],
}

# ---------------------------------------------------------------------------
# DB — Postgres in production (via DATABASE_URL), SQLite as a local fallback.
# A fresh Postgres connection is opened per operation so a serverless DB that
# closes idle sockets (e.g. Neon scaling to zero) can never break a submission.
# ---------------------------------------------------------------------------
_CREATE_TABLE = """CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    name TEXT, email TEXT, phone TEXT,
    event_type TEXT, event_date TEXT, venue TEXT, guest_count TEXT,
    package TEXT, message TEXT,
    notify_email TEXT, notify_sms TEXT, notify_autoreply TEXT,
    status TEXT DEFAULT 'new',
    booked INTEGER DEFAULT 0
)"""

_CREATE_TESTIMONIALS = """CREATE TABLE IF NOT EXISTS testimonials (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    name TEXT, event_type TEXT,
    rating INTEGER DEFAULT 5,
    testimonial TEXT,
    status TEXT DEFAULT 'pending'
)"""

class Database:
    def __init__(self):
        self.url = os.environ.get("DATABASE_URL", "").strip()
        self.pg = bool(self.url)
        self._lock = threading.Lock()
        if self.pg:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            self._psycopg2 = psycopg2
            self._cursor = RealDictCursor
        else:
            os.makedirs("data", exist_ok=True)
            self._sqlite = sqlite3.connect("data/inquiries.db", check_same_thread=False)
            self._sqlite.row_factory = sqlite3.Row
        self._init_schema()

    @staticmethod
    def _norm(url: str) -> str:
        # psycopg2 expects the postgresql:// scheme; many hosts hand out postgres://
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url

    def _pg(self):
        return self._psycopg2.connect(self._norm(self.url), cursor_factory=self._cursor)

    def _q(self, sql: str) -> str:
        # SQLite uses ? placeholders; Postgres uses %s.
        return sql.replace("?", "%s") if self.pg else sql

    def _init_schema(self):
        if self.pg:
            with self._pg() as c:
                c.cursor().execute(self._q(_CREATE_TABLE))
                c.cursor().execute(self._q(_CREATE_TESTIMONIALS))
        else:
            with self._lock:
                self._sqlite.execute(self._q(_CREATE_TABLE))
                for _col, _decl in [("notify_autoreply", "TEXT"), ("booked", "INTEGER DEFAULT 0")]:
                    try:
                        self._sqlite.execute(f"ALTER TABLE inquiries ADD COLUMN {_col} {_decl}")
                    except sqlite3.OperationalError:
                        pass  # column already exists
                self._sqlite.execute(self._q(_CREATE_TESTIMONIALS))
                self._sqlite.commit()

    def execute(self, sql, params=()):
        """Run a write (INSERT/UPDATE). Commits immediately."""
        if self.pg:
            with self._pg() as c:
                c.cursor().execute(self._q(sql), params)
        else:
            with self._lock:
                self._sqlite.execute(self._q(sql), params)
                self._sqlite.commit()

    def fetch(self, sql, params=()):
        """Run a read and return a list of dict rows."""
        if self.pg:
            with self._pg() as c:
                cur = c.cursor()
                cur.execute(self._q(sql), params)
                rows = cur.fetchall()
            return [dict(r) for r in rows]
        else:
            with self._lock:
                rows = self._sqlite.execute(self._q(sql), params).fetchall()
            return [{k: r[k] for k in r.keys()} for r in rows]

    def commit(self):
        # Writes already auto-commit in execute(); kept for compatibility.
        if not self.pg:
            with self._lock:
                self._sqlite.commit()

DB = Database()

# ---------------------------------------------------------------------------
# Auth + rate limiting
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def check_token(request: Request) -> None:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    token = auth[7:]
    if token != hash_password(ADMIN_PASSWORD):
        raise HTTPException(401, "Unauthorized")

# Simple in-memory sliding-window rate limit per IP. (For production, swap in
# Redis or a DB-backed limiter — this resets on restart, which is fine for a
# prototype and still stops most abuse.)
_RATE_MAX = 5            # max inquiries
_RATE_WINDOW = 3600      # per hour
_ip_hits: defaultdict = defaultdict(deque)

def rate_limited(ip: str) -> bool:
    now = time()
    q = _ip_hits[ip]
    while q and q[0] < now - _RATE_WINDOW:
        q.popleft()
    if len(q) >= _RATE_MAX:
        return True
    q.append(now)
    return False

def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="BeatsByBayo Notify")
# Lock CORS down to the deployed site origin (falls back to * for local dev).
_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",")],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.middleware("http")
async def cache_control_headers(request: Request, call_next):
    """Prevent browsers from serving stale HTML/JSON. Heuristic caching was
    causing visitors to see an old form with broken selects after deploys."""
    response = await call_next(request)
    ctype = response.headers.get("content-type", "")
    if "text/html" in ctype or "application/json" in ctype:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

class Inquiry(BaseModel):
    name: str
    email: str
    phone: str
    event_type: str
    event_date: str
    venue: str = ""
    guest_count: str = ""
    package: str = ""
    message: str = ""
    website: str = ""  # honeypot — must be empty

class LoginReq(BaseModel):
    password: str

class BookedReq(BaseModel):
    booked: bool

def fmt_inquiry(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}

@app.post("/api/inquiries")
async def create_inquiry(inq: Inquiry, request: Request, background_tasks: BackgroundTasks):
    # Honeypot: real users never see this hidden field; bots fill it.
    if inq.website.strip():
        return {"ok": True, "id": "spam"}  # silently accept, do nothing

    # Basic input validation.
    if len(inq.name.strip()) < 2 or "@" not in inq.email or not inq.event_date.strip():
        raise HTTPException(400, "Please complete name, email, and event date.")

    # Rate limit per IP.
    ip = client_ip(request)
    if rate_limited(ip):
        raise HTTPException(429, "Too many requests. Please try again in a few minutes.")

    iid = secrets.token_hex(8)
    now = datetime.now(timezone.utc).isoformat()
    DB.execute(
        """INSERT INTO inquiries
           (id, created_at, name, email, phone, event_type, event_date,
            venue, guest_count, package, message, notify_email, notify_sms,
            notify_autoreply, status, booked)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'new', 0)""",
        (iid, now, inq.name, inq.email, inq.phone, inq.event_type,
         inq.event_date, inq.venue, inq.guest_count, inq.package, inq.message,
         "pending", "pending", "pending"),
    )
    DB.commit()

    # Fire notifications in the background so the response returns immediately.
    background_tasks.add_task(process_inquiry_notifications, iid, inq)

    return {"ok": True, "id": iid, "notify": {
        "email": "queued", "sms": "queued", "autoreply": "queued"
    }}


async def process_inquiry_notifications(iid: str, inq: Inquiry):
    """Best-effort notification dispatch — runs after the HTTP response is sent."""
    email_status = "skipped"
    sms_status = "skipped"
    autoreply_status = "skipped"
    try:
        email_status = await send_email(inq)
    except Exception as e:
        email_status = f"error: {e}"
    try:
        sms_status = await send_sms(inq)
    except Exception as e:
        sms_status = f"error: {e}"
    try:
        autoreply_status = await send_auto_reply(inq)
    except Exception as e:
        autoreply_status = f"error: {e}"

    try:
        DB.execute(
            """UPDATE inquiries
               SET notify_email=?, notify_sms=?, notify_autoreply=? WHERE id=?""",
            (email_status, sms_status, autoreply_status, iid),
        )
        DB.commit()
    except Exception:
        pass


@app.post("/api/admin/login")
def admin_login(req: LoginReq):
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(401, "Incorrect password")
    token = hash_password(ADMIN_PASSWORD)
    return {"token": token, "pricing": PRICING}

@app.get("/api/admin/inquiries")
def admin_list_inquiries(request: Request):
    check_token(request)
    rows = DB.fetch("SELECT * FROM inquiries ORDER BY created_at DESC")
    return {"inquiries": [fmt_inquiry(r) for r in rows]}

@app.post("/api/admin/inquiries/{iid}/status")
def admin_set_status(iid: str, status: str, request: Request):
    check_token(request)
    DB.execute("UPDATE inquiries SET status=? WHERE id=?", (status, iid))
    DB.commit()
    return {"ok": True}

@app.post("/api/admin/inquiries/{iid}/booked")
def admin_set_booked(iid: str, req: BookedReq, request: Request):
    check_token(request)
    DB.execute("UPDATE inquiries SET booked=? WHERE id=?", (1 if req.booked else 0, iid))
    DB.commit()
    return {"ok": True}

@app.get("/api/booked-dates")
def booked_dates():
    """Public: list of event dates Bayo has confirmed (taken)."""
    rows = DB.fetch(
        "SELECT DISTINCT event_date FROM inquiries WHERE booked=1 AND event_date<>''"
    )
    return {"booked_dates": [r["event_date"] for r in rows]}

class Testimonial(BaseModel):
    name: str
    event_type: str = ""
    rating: int = 5
    testimonial: str
    website: str = ""  # honeypot — must be empty

@app.get("/api/testimonials")
def list_testimonials():
    """Public: approved testimonials only, newest first."""
    rows = DB.fetch(
        "SELECT name, event_type, rating, testimonial, created_at FROM testimonials "
        "WHERE status='approved' ORDER BY created_at DESC"
    )
    return {"testimonials": rows}

@app.post("/api/testimonials")
async def create_testimonial(t: Testimonial, request: Request):
    if t.website.strip():
        return {"ok": True, "id": "spam"}
    name = t.name.strip()
    body = t.testimonial.strip()
    rating = int(t.rating)
    if len(name) < 2 or len(body) < 5:
        raise HTTPException(400, "Please add your name and a few words about your experience.")
    if rating < 1 or rating > 5:
        rating = 5
    ip = client_ip(request)
    if rate_limited(ip):
        raise HTTPException(429, "Too many requests. Please try again in a few minutes.")
    tid = secrets.token_hex(8)
    now = datetime.now(timezone.utc).isoformat()
    DB.execute(
        "INSERT INTO testimonials (id, created_at, name, event_type, rating, testimonial, status) "
        "VALUES (?,?,?,?,?,?, 'pending')",
        (tid, now, name, t.event_type.strip(), rating, body),
    )
    DB.commit()
    try:
        await send_review_notify(name, t.event_type.strip(), rating, body)
    except Exception:
        pass
    return {"ok": True, "id": tid, "status": "pending"}

@app.get("/api/admin/testimonials")
def admin_list_testimonials(request: Request):
    check_token(request)
    rows = DB.fetch("SELECT * FROM testimonials ORDER BY created_at DESC")
    return {"testimonials": rows}

@app.post("/api/admin/testimonials/{tid}/approve")
def admin_approve_testimonial(tid: str, request: Request):
    check_token(request)
    DB.execute("UPDATE testimonials SET status='approved' WHERE id=?", (tid,))
    DB.commit()
    return {"ok": True}

@app.post("/api/admin/testimonials/{tid}/reject")
def admin_reject_testimonial(tid: str, request: Request):
    check_token(request)
    DB.execute("UPDATE testimonials SET status='rejected' WHERE id=?", (tid,))
    DB.commit()
    return {"ok": True}

@app.get("/api/health")
def health():
    return {"ok": True, "owner_email": OWNER_EMAIL, "from_email": FROM_EMAIL}

# ---------------------------------------------------------------------------
# Notification senders
# ---------------------------------------------------------------------------
def _load_secret(key: str, env: str = "") -> str:
    """Read a secret from secrets.json, falling back to an env var."""
    try:
        with open("secrets.json") as f:
            v = json.load(f).get(key, "")
            if v:
                return v
    except Exception:
        pass
    return os.environ.get(env, "")

# Branded from-address, now that beatsbybayo.com is verified in Resend.
def _from_email() -> str:
    return _load_secret("resend_from_email", "RESEND_FROM_EMAIL") or FROM_EMAIL

async def send_email(inq: Inquiry) -> str:
    """Notify Bayo of a new inquiry via Resend."""
    token = _load_secret("resend_key", "RESEND_API_KEY")
    if not token:
        return "not_configured"
    subject = f"New inquiry — {inq.event_type} — {inq.event_date}"
    body = "\n".join([
        "New event request — BeatsByBayo",
        "",
        f"Name: {inq.name}",
        f"Email: {inq.email}",
        f"Phone: {inq.phone}",
        f"Event type: {inq.event_type}",
        f"Event date: {inq.event_date}",
        f"Venue: {inq.venue or '-'}",
        f"Guest count: {inq.guest_count or '-'}",
        f"Package interest: {inq.package or 'Not selected'}",
        f"Notes: {inq.message or '-'}",
    ])
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{RESEND_HOST}/emails",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "from": _from_email(),
                "to": [OWNER_EMAIL],
                "subject": subject,
                "text": body,
            },
        )
    if resp.status_code in (200, 201):
        data = resp.json()
        return f"sent:{data.get('id','?')}"
    return f"failed:{resp.status_code}:{resp.text[:300]}"

async def send_auto_reply(inq: Inquiry) -> str:
    """Send a friendly confirmation to the client.

    Requires a verified sending domain in Resend to deliver to arbitrary
    client addresses. With the test sender this only delivers to the Resend
    account owner — so it activates once you verify a domain.
    """
    token = _load_secret("resend_key", "RESEND_API_KEY")
    if not token:
        return "not_configured"
    first = inq.name.strip().split()[0] or inq.name
    text = (
        f"Hi {first},\n\n"
        f"Thanks for reaching out to BeatsByBayo — I've received your request for "
        f"your {inq.event_type} on {inq.event_date}. I'll personally review it and "
        f"reply within 24 hours.\n\n"
        f"If it's urgent, call or text Bayo at {OWNER_PHONE}.\n\n"
        "Talk soon,\nBayo — BeatsByBayo"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{RESEND_HOST}/emails",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "from": _from_email(),
                "to": [inq.email],
                "subject": f"Got your request, {first} — BeatsByBayo",
                "text": text,
            },
        )
    if resp.status_code in (200, 201):
        data = resp.json()
        return f"sent:{data.get('id','?')}"
    return f"failed:{resp.status_code}:{resp.text[:300]}"

async def send_sms(inq: Inquiry) -> str:
    """Notify Bayo via Telegram Bot API."""
    token = _load_secret("telegram_bot_token", "TELEGRAM_BOT_TOKEN")
    chat_id = _load_secret("telegram_chat_id", "TELEGRAM_CHAT_ID")
    if not token:
        return "not_configured"
    if not chat_id:
        return "no_chat_id"
    msg = (
        "*New inquiry — BeatsByBayo*\n\n"
        f"*Name:* {inq.name}\n"
        f"*Event:* {inq.event_type} on {inq.event_date}\n"
        f"*Venue:* {inq.venue or '-'}\n"
        f"*Guests:* {inq.guest_count or '-'}\n"
        f"*Package:* {inq.package or 'Not selected'}\n"
        f"*Phone:* {inq.phone}\n"
        f"*Email:* {inq.email}\n"
        f"*Notes:* {inq.message or '-'}"
    )
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, data={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"})
    if resp.status_code in (200, 201):
        data = resp.json()
        return "sent" if data.get("ok") else f"failed:{resp.status_code}"
    return f"failed:{resp.status_code}"

async def send_review_notify(name: str, event_type: str, rating: int, body: str) -> str:
    """Notify Bayo that a review is awaiting approval."""
    token = _load_secret("telegram_bot_token", "TELEGRAM_BOT_TOKEN")
    chat_id = _load_secret("telegram_chat_id", "TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return "not_configured"
    stars = "★" * rating + "☆" * (5 - rating)
    msg = (
        "*New review awaiting approval — BeatsByBayo*\n\n"
        f"*From:* {name}\n"
        f"*Event:* {event_type or '-'}\n"
        f"*Rating:* {stars}\n"
        f"*Review:* {body}\n\n"
        "Approve it in the admin panel to publish."
    )
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, data={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"})
    return "sent" if resp.json().get("ok") else f"failed:{resp.status_code}"

@app.get("/api/admin/telegram-updates")
def telegram_updates(request: Request):
    """Debug: verify token via getMe and list recent updates to discover chat_id."""
    check_token(request)
    token = _load_secret("telegram_bot_token", "TELEGRAM_BOT_TOKEN")
    if not token:
        return {"error": "no_token"}
    with httpx.Client(timeout=15) as client:
        me = client.get(f"https://api.telegram.org/bot{token}/getMe")
        ups = client.post(f"https://api.telegram.org/bot{token}/getUpdates", data={"timeout": 0})
    return {"getMe": me.json(), "getUpdates": ups.json()}

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/admin.html")
def admin_page():
    return FileResponse("static/admin.html")

@app.get("/review.html")
def review_page():
    return FileResponse("static/review.html")

# Serve the static site (logo, css, js) — mounted AFTER all API routes so
# /api/* still hits the API. When hosted on Render this makes beatsbybayo.com
# serve the full site + API from one origin.
app.mount("/", StaticFiles(directory="static", html=True), name="site")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
