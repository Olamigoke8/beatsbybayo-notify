# Deploy BeatsByBayo notification backend (24/7)

This FastAPI app receives booking inquiries from the public site and fires
email + Telegram notifications to Bayo. Deploy it to a persistent host so it
runs around the clock (the Perplexity Computer sandbox only stays alive during
an active session).

## Option A — Render (recommended, free tier)

1. Go to https://render.com and sign in (or create an account).
2. New → Web Service → "Build and deploy from a Git repository."
3. Push this `beatsbybayo-notify-api` folder to a GitHub repo, connect it.
4. Render auto-detects the Dockerfile. Set these environment variables:
   - `ADMIN_PASSWORD` = `@9102DJtrippleb`
   - `RESEND_API_KEY` = your Resend key (starts with `re_`)
   - `TELEGRAM_BOT_TOKEN` = your bot token from @BotFather
   - `TELEGRAM_CHAT_ID` = `8879855628`
   - `OWNER_EMAIL` = `beatsbybayo@gmail.com`
5. Deploy. Render gives you a URL like `https://beatsbybayo-notify.onrender.com`.
6. In the public site's `script.js`, replace the `__PORT_8000__` base URL with
   that Render URL. Re-deploy the site.

## Option B — keep running in the sandbox (prototype only)

Run with the Computer `start_server` tool (or `python3 -m uvicorn app:app`).
Secrets live in `secrets.json` next to this file. Stops when the session ends.

## Secrets

For production, use environment variables (above) instead of `secrets.json`.
Never commit `secrets.json` or `data/inquiries.db`.

## Enabling branded email + client auto-reply

Resend's default sender only delivers to the account owner email. To send
branded emails (`Bayo <bayo@beatsbybayo.com>`) and auto-replies to clients:
1. (Optional) Buy a domain (e.g. beatsbybayo.com).
2. In Resend → Domains → Add domain → add the DNS records Resend shows.
3. Set `RESEND_FROM_EMAIL` = `Bayo <bayo@beatsbybayo.com>` in Render env.
