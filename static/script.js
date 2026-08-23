/* BeatsByBayo — redesign JS (v3)
   - Hero dropdown CTA menus (Get my quote / See packages)
   - ONE reusable inline quote panel, moved between slots (hero/events/packages)
   - Event cards + package buttons open the panel inline (NO scroll to bottom)
   - Inline panel submits to /api/inquiries with inline success
   - Native selects/date inputs work out of the box
   - Bottom full form submit + contact band below it
   - WhatsApp / email fallback sync (inline + bottom)
   - Mobile menu, year, testimonials loader
*/
(function(){
  "use strict";

  // ---------- API detection ----------
  var API_BASE = "__PORT_8000__";
  if (API_BASE.indexOf("__PORT_8000__") !== -1) API_BASE = "";
  var API_INQUIRIES    = API_BASE + "/api/inquiries";
  var API_TESTIMONIALS = API_BASE + "/api/testimonials";

  // ---------- Helpers ----------
  function $(s, c){ return (c||document).querySelector(s); }
  function $$(s, c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); }
  function on(el, ev, fn){ if(el) el.addEventListener(ev, fn); }

  // ---------- Year ----------
  var y = $("#year"); if (y) y.textContent = new Date().getFullYear();

  // ---------- Mobile menu ----------
  var menu = $("#mobileMenu"), toggle = $("#menuToggle"), closeBtn = $("#menuClose");
  function setMenu(open){
    if (!menu || !toggle) return;
    if (open){ menu.classList.add("open"); menu.setAttribute("aria-hidden","false");
      toggle.setAttribute("aria-expanded","true"); document.body.style.overflow="hidden"; }
    else { menu.classList.remove("open"); menu.setAttribute("aria-hidden","true");
      toggle.setAttribute("aria-expanded","false"); document.body.style.overflow=""; }
  }
  on(toggle,"click", function(){ setMenu(!menu.classList.contains("open")); });
  on(closeBtn,"click", function(){ setMenu(false); });
  $$(".mobile-link").forEach(function(a){ on(a,"click", function(){ setMenu(false); }); });

  // ---------- Reusable inline quote panel ----------
  var tpl = $("#inlineQuoteTpl");
  var panel = tpl ? tpl.content.querySelector("form").cloneNode(true) : null;
  // hidden holder so an empty slot collapses (display:none via :empty)
  var hold = document.createElement("div");
  hold.style.display = "none";
  document.body.appendChild(hold);
  if (panel) hold.appendChild(panel);

  var EVENT_OPTS = ["Corporate Event","Wedding","50+ Social","Anniversary","Reunion","Retirement Party","Private Event","Community Event","Other"];
  var PKG_OPTS = ["Basic","Signature","Premium","Custom / Last-Minute"];

  function setSelect(sel, val){
    if (!sel || !val) return;
    var match = Array.prototype.find.call(sel.options, function(o){ return o.value === val || o.textContent === val; });
    if (match) sel.value = match.value || match.textContent;
  }

  function showInlinePanel(opts){
    if (!panel) return;
    opts = opts || {};
    // choose slot
    var slot = document.getElementById(opts.slot || "slotHero") || $("#slotHero");
    // move panel into the slot (removes from previous parent)
    slot.appendChild(panel);
    panel.hidden = false;
    // Wait for layout to settle (dropdown collapse anim ~300ms), then instant-scroll
    // so the panel top sits just below the sticky header.
    setTimeout(function(){
      var rect = panel.getBoundingClientRect();
      var target = Math.max(0, window.scrollY + rect.top - 88);
      window.scrollTo(0, target);
      // focus first empty required input after scroll settles
      var firstEmpty = $$('input[required], select[required]', panel).filter(function(el){ return !el.value; })[0];
      if (firstEmpty) setTimeout(function(){ firstEmpty.focus({ preventScroll:true }); }, 120);
    }, 340);
    // prefill
    if (opts.eventType) setSelect(panel.querySelector('[name="event-type"]'), opts.eventType);
    if (opts.pkg) setSelect(panel.querySelector('[name="package"]'), opts.pkg);
    // hide any prior success
    var succ = panel.querySelector(".inline-success");
    if (succ){ succ.hidden = true; succ.textContent=""; }
    syncInlineFallback();
  }

  function hideInlinePanel(){ if (panel) hold.appendChild(panel); }

  // Close button
  on(panel, "click", function(e){
    var c = e.target.closest("[data-close-inline]");
    if (c){ hideInlinePanel(); }
  });

  // ---------- Hero dropdown menus ----------
  $$(".dropdown").forEach(function(dd){
    var btn = dd.querySelector(".dd-btn");
    var menuEl = dd.querySelector(".dd-menu");
    if (!btn || !menuEl) return;
    on(btn,"click", function(e){
      e.preventDefault();
      var isOpen = dd.classList.contains("is-open");
      // close all
      $$(".dropdown").forEach(function(d){ d.classList.remove("is-open"); d.querySelector(".dd-btn")?.setAttribute("aria-expanded","false"); });
      if (!isOpen){ dd.classList.add("is-open"); btn.setAttribute("aria-expanded","true"); }
    });
    // menu items
    $$("button", menuEl).forEach(function(item){
      on(item,"click", function(){
        dd.classList.remove("is-open"); btn.setAttribute("aria-expanded","false");
        var ev = item.getAttribute("data-event");
        var pkg = item.getAttribute("data-pkg");
        var scroll = item.getAttribute("data-scroll");
        if (ev) showInlinePanel({ eventType: ev, slot: "slotHero" });
        else if (pkg) showInlinePanel({ pkg: pkg, slot: "slotPackages" });
        else if (scroll){ var t = document.getElementById(scroll); if (t) t.scrollIntoView({behavior:"smooth",block:"start"}); }
      });
    });
  });
  // Close dropdowns on outside click / escape
  document.addEventListener("click", function(e){
    if (!e.target.closest(".dropdown")) $$(".dropdown").forEach(function(d){ d.classList.remove("is-open"); });
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ $$(".dropdown").forEach(function(d){ d.classList.remove("is-open"); }); }
  });

  // ---------- Event cards ----------
  $$("[data-event]").forEach(function(el){
    if (el.matches(".dd-menu button")) return; // hero dropdown handled above
    on(el,"click", function(){
      // mark active card
      $$(".event-card").forEach(function(c){ c.classList.remove("is-active"); });
      el.classList.add("is-active");
      showInlinePanel({ eventType: el.getAttribute("data-event"), slot: "slotEvents" });
    });
  });

  // ---------- Package buttons ----------
  $$("[data-pkg]").forEach(function(el){
    if (el.matches(".dd-menu button")) return;
    on(el,"click", function(){
      showInlinePanel({ pkg: el.getAttribute("data-pkg"), slot: "slotPackages" });
    });
  });

  // ---------- "Ask Bayo for a sample" etc. → open hero panel ----------
  $$("[data-open-quote]").forEach(function(el){
    on(el,"click", function(){ showInlinePanel({ slot: el.getAttribute("data-open-quote") || "slotHero" }); });
  });

  // ---------- Fallback text builders ----------
  function buildFallbackText(fd){
    var lines = ["Hi Bayo, requesting a quote via BeatsByBayo:"];
    var fields = [["Name",fd.get("name")],["Email",fd.get("email")],["Phone",fd.get("phone")],
      ["Event",fd.get("event-type")],["Date",fd.get("event-date")],["Package",fd.get("package")]];
    fields.forEach(function(p){ if (p[1]) lines.push(p[0]+": "+p[1]); });
    var msg = (fd.get("message")||"").trim();
    if (msg) lines.push("\nNotes: "+msg);
    return lines.join("\n");
  }
  function syncInlineFallback(){
    if (!panel) return;
    var fd = new FormData(panel);
    var body = buildFallbackText(fd);
    var wa = "https://wa.me/17047042179?text="+encodeURIComponent(body);
    var mailto = "mailto:beatsbybayo@gmail.com?subject="+encodeURIComponent("Quote request — "+(fd.get("event-type")||"BeatsByBayo"))+"&body="+encodeURIComponent(body);
    var w = panel.querySelector("[data-wa-inline]"); if (w) w.href = wa;
    var m = panel.querySelector("[data-mail-inline]"); if (m) m.href = mailto;
  }
  if (panel){ ["input","change"].forEach(function(ev){ panel.addEventListener(ev, syncInlineFallback); }); }

  // ---------- Inline panel submit ----------
  on(panel,"submit", function(e){
    e.preventDefault();
    var fd = new FormData(panel);
    if (fd.get("website")) return; // honeypot
    var succ = panel.querySelector(".inline-success");
    var btn = panel.querySelector('button[type="submit"]');
    if (btn){ btn.disabled = true; btn.dataset.orig = btn.textContent; btn.textContent = "Sending…"; }
    var payload = {
      name: fd.get("name")||"", email: fd.get("email")||"", phone: fd.get("phone")||"",
      event_type: fd.get("event-type")||"", event_date: fd.get("event-date")||"",
      venue: "", guest_count: null, package: fd.get("package")||"",
      message: (fd.get("message")||"").trim(), website: ""
    };
    fetch(API_INQUIRIES, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) })
      .then(function(r){ if(!r.ok) throw new Error("network"); return r.json(); })
      .then(function(){
        if (succ){ succ.hidden=false; succ.textContent="Thanks! Your request is in — Bayo will reply shortly with availability and a tailored quote."; }
        panel.reset(); syncInlineFallback();
        if (btn){ btn.disabled=false; btn.textContent = btn.dataset.orig || "Send my request"; }
      })
      .catch(function(){
        if (succ){ succ.hidden=false;
          succ.textContent="Couldn't send from the site right now — tap the WhatsApp or email link below and your details will be filled in.";
          succ.style.background="rgba(245,110,46,.14)"; succ.style.color="#ff8a4d"; }
        if (btn){ btn.disabled=false; btn.textContent = btn.dataset.orig || "Send my request"; }
      });
  });

  // ---------- Bottom full form ----------
  var bookingForm = $("#bookingForm");
  function composedMessage(fd){
    var addons = fd.getAll("addon");
    var base = (fd.get("message")||"").trim();
    if (addons.length){ var line = "Add-ons requested: "+addons.join(", ")+"."; base = base ? (base+"\n\n"+line) : line; }
    return base;
  }
  function syncBottomFallback(){
    if (!bookingForm) return;
    var fd = new FormData(bookingForm);
    var body = buildFallbackText(fd);
    var wa = "https://wa.me/17047042179?text="+encodeURIComponent(body);
    var mailto = "mailto:beatsbybayo@gmail.com?subject="+encodeURIComponent("Quote request — "+(fd.get("event-type")||"BeatsByBayo"))+"&body="+encodeURIComponent(body);
    var waBtn = $("#whatsappBtn"); if (waBtn) waBtn.href = wa;
    var mailBtn = $("#emailBtn"); if (mailBtn) mailBtn.href = mailto;
  }
  if (bookingForm){ ["input","change"].forEach(function(ev){ bookingForm.addEventListener(ev, syncBottomFallback); }); syncBottomFallback(); }

  on(bookingForm,"submit", function(e){
    e.preventDefault();
    var fd = new FormData(bookingForm);
    if (fd.get("website")) return;
    var success = $("#formSuccess");
    var payload = {
      name: fd.get("name")||"", email: fd.get("email")||"", phone: fd.get("phone")||"",
      event_type: fd.get("event-type")||"", event_date: fd.get("event-date")||"",
      venue: fd.get("venue")||"", guest_count: fd.get("guest-count") ? Number(fd.get("guest-count")) : null,
      package: fd.get("package")||"", message: composedMessage(fd), website: ""
    };
    var btn = bookingForm.querySelector('button[type="submit"]');
    if (btn){ btn.disabled=true; btn.dataset.orig = btn.textContent; btn.textContent="Sending…"; }
    fetch(API_INQUIRIES, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) })
      .then(function(r){ if(!r.ok) throw new Error("network"); return r.json(); })
      .then(function(){
        if (success){ success.hidden=false;
          success.textContent="Thanks! Your request is in — Bayo will reply shortly with availability and a tailored quote."; }
        bookingForm.reset(); syncBottomFallback();
        if (btn){ btn.disabled=false; btn.textContent = btn.dataset.orig || "Send my request"; }
      })
      .catch(function(){
        if (success){ success.hidden=false;
          success.textContent="Couldn't send from the site right now — please tap the WhatsApp or email link below and your details will be filled in.";
          success.style.background="rgba(245,110,46,.14)"; success.style.color="#ff8a4d"; }
        if (btn){ btn.disabled=false; btn.textContent = btn.dataset.orig || "Send my request"; }
      });
  });

  // ---------- Testimonials ----------
  function loadTestimonials(){
    var wrap = $("#testimonialList"); if (!wrap) return;
    fetch(API_TESTIMONIALS)
      .then(function(r){ if(!r.ok) throw new Error("no api"); return r.json(); })
      .then(function(data){
        var items = (data && data.testimonials) || (Array.isArray(data) ? data : []);
        if (!items.length) return;
        wrap.innerHTML = "";
        items.slice(0,6).forEach(function(t){
          var card = document.createElement("article"); card.className = "review-card";
          var stars = "★★★★★".slice(0, Math.max(1, Math.min(5, t.rating||5)));
          card.innerHTML =
            '<div class="review-stars" aria-label="'+(t.rating||5)+' out of 5 stars">'+stars+'</div>'+
            '<blockquote>"'+(t.testimonial||"").replace(/</g,"&lt;")+'"</blockquote>'+
            '<p class="review-meta">— '+(t.name||"Client").replace(/</g,"&lt;")+
            (t.event_type ? ' · '+t.event_type.replace(/</g,"&lt;") : "")+'</p>';
          wrap.appendChild(card);
        });
      })
      .catch(function(){ /* leave empty state */ });
  }
  loadTestimonials();

})();
