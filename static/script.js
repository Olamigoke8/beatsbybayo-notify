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
    sel.dispatchEvent(new Event("change", {bubbles:true}));
  }

  // ---------- Custom dropdown menus ----------
  // Replaces native <select> + date inputs with a visible, tappable option
  // list. Native pickers are unreliable in some in-app browsers (Instagram,
  // Facebook) — these custom menus work everywhere.
  function buildCustomDD(selectEl){
    if(!selectEl || selectEl.dataset.ddBuilt) return;
    selectEl.dataset.ddBuilt = "1";
    var opts = [];
    for(var i=0;i<selectEl.options.length;i++){
      var o = selectEl.options[i];
      opts.push({ val:o.value, text:o.textContent.trim(), disabled:!!o.disabled });
    }
    var placeholder = (opts[0] && !opts[0].val) ? opts[0].text : (opts[0] ? opts[0].text : "Select");
    selectEl.classList.add("dd-native-hidden");
    var wrap = document.createElement("div"); wrap.className = "custom-dd";
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);

    var btn = document.createElement("button"); btn.type="button"; btn.className="custom-dd-btn";
    btn.setAttribute("aria-haspopup","listbox"); btn.setAttribute("aria-expanded","false");
    var val = document.createElement("span"); val.className="custom-dd-val is-placeholder"; val.textContent=placeholder;
    var chev = document.createElement("span"); chev.className="custom-dd-chev";
    chev.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    btn.appendChild(val); btn.appendChild(chev);

    var list = document.createElement("ul"); list.className="custom-dd-list"; list.setAttribute("role","listbox");
    opts.forEach(function(o){
      var li = document.createElement("li"); li.setAttribute("role","option"); li.dataset.val = o.val;
      var s = document.createElement("span"); s.textContent = o.text; li.appendChild(s);
      var tick = document.createElement("span"); tick.className="dd-tick"; tick.textContent="✓"; li.appendChild(tick);
      if(o.disabled) li.className="is-disabled";
      li.addEventListener("click", function(e){ e.stopPropagation(); if(o.disabled) return; pick(o); });
      list.appendChild(li);
    });
    wrap.appendChild(btn); wrap.appendChild(list);

    function markSelected(v){ Array.prototype.forEach.call(list.children, function(li){ li.classList.toggle("is-selected", li.dataset.val===v && v!==""); }); }
    function pick(o){
      selectEl.value = o.val;
      val.textContent = o.text;
      val.classList.toggle("is-placeholder", !o.val);
      markSelected(o.val);
      close();
      selectEl.dispatchEvent(new Event("change", {bubbles:true}));
    }
    function open(){ wrap.classList.add("is-open"); btn.setAttribute("aria-expanded","true"); }
    function close(){ wrap.classList.remove("is-open"); btn.setAttribute("aria-expanded","false"); }
    btn.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); wrap.classList.contains("is-open") ? close() : open(); });
    selectEl.addEventListener("change", function(){
      var m = opts.filter(function(o){ return o.val===selectEl.value; })[0];
      if(m){ val.textContent=m.text; val.classList.toggle("is-placeholder", !m.val); markSelected(m.val); }
    });
    selectEl.addEventListener("reset-dd", function(){ val.textContent=placeholder; val.classList.add("is-placeholder"); markSelected(""); });
  }

  function buildCustomDate(inp){
    if(!inp || inp.dataset.ddBuilt) return;
    inp.dataset.ddBuilt = "1";
    inp.type = "hidden"; // keep name="event-date" for form submission
    inp.classList.add("dd-native-hidden");
    // generate upcoming weekend dates (Fri/Sat/Sun) for the next ~10 weeks
    var dates = []; var base = new Date(); base.setHours(0,0,0,0);
    for(var i=0;i<70 && dates.length<24;i++){
      var t = new Date(base.getTime() + i*86400000);
      var wd = t.getDay();
      if(wd===5||wd===6||wd===0){
        var v = t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0");
        var lbl = t.toLocaleDateString(undefined, {weekday:"short",month:"short",day:"numeric"});
        dates.push({val:v, text:lbl});
      }
    }
    var wrap = document.createElement("div"); wrap.className="custom-dd date-dd";
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);

    var btn = document.createElement("button"); btn.type="button"; btn.className="custom-dd-btn";
    btn.setAttribute("aria-haspopup","listbox"); btn.setAttribute("aria-expanded","false");
    var valEl = document.createElement("span"); valEl.className="custom-dd-val is-placeholder"; valEl.textContent="Select date";
    var chev = document.createElement("span"); chev.className="custom-dd-chev";
    chev.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    btn.appendChild(valEl); btn.appendChild(chev);

    var list = document.createElement("ul"); list.className="custom-dd-list"; list.setAttribute("role","listbox");
    dates.forEach(function(o){
      var li = document.createElement("li"); li.setAttribute("role","option"); li.dataset.val=o.val;
      var s = document.createElement("span"); s.textContent=o.text; li.appendChild(s);
      var tick = document.createElement("span"); tick.className="dd-tick"; tick.textContent="✓"; li.appendChild(tick);
      li.addEventListener("click", function(e){ e.stopPropagation(); pickDate(o); });
      list.appendChild(li);
    });
    var otherLi = document.createElement("li"); otherLi.dataset.val="__other__";
    var os = document.createElement("span"); os.textContent="Other date — type it"; otherLi.appendChild(os);
    var otick = document.createElement("span"); otick.className="dd-tick"; otick.textContent="✓"; otherLi.appendChild(otick);
    otherLi.addEventListener("click", function(e){ e.stopPropagation(); pickOther(); });
    list.appendChild(otherLi);

    var otherInput = document.createElement("input"); otherInput.type="text"; otherInput.className="date-other-input"; otherInput.placeholder="MM/DD/YYYY"; otherInput.autocomplete="off";
    wrap.appendChild(btn); wrap.appendChild(list); wrap.appendChild(otherInput);

    function markSelected(v){ Array.prototype.forEach.call(list.children, function(li){ li.classList.toggle("is-selected", li.dataset.val===v); }); }
    function pickDate(o){ inp.value=o.val; valEl.textContent=o.text; valEl.classList.remove("is-placeholder"); markSelected(o.val); otherInput.classList.remove("is-shown"); otherInput.value=""; close(); inp.dispatchEvent(new Event("change",{bubbles:true})); }
    function pickOther(){ valEl.textContent="Other date"; valEl.classList.remove("is-placeholder"); markSelected("__other__"); otherInput.classList.add("is-shown"); setTimeout(function(){ otherInput.focus(); }, 50); close(); inp.dispatchEvent(new Event("change",{bubbles:true})); }
    otherInput.addEventListener("input", function(){ inp.value = otherInput.value; inp.dispatchEvent(new Event("change",{bubbles:true})); });
    function open(){ wrap.classList.add("is-open"); btn.setAttribute("aria-expanded","true"); }
    function close(){ wrap.classList.remove("is-open"); btn.setAttribute("aria-expanded","false"); }
    btn.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); wrap.classList.contains("is-open") ? close() : open(); });
    inp.addEventListener("reset-dd", function(){ valEl.textContent="Select date"; valEl.classList.add("is-placeholder"); markSelected(""); otherInput.classList.remove("is-shown"); otherInput.value=""; });
  }

  // single delegated outside-click closer
  document.addEventListener("click", function(e){
    $$(".custom-dd.is-open").forEach(function(dd){ if(!dd.contains(e.target)){ dd.classList.remove("is-open"); var b=dd.querySelector(".custom-dd-btn"); if(b) b.setAttribute("aria-expanded","false"); } });
  });

  function enhanceAll(root){
    $$("select", root).forEach(buildCustomDD);
    $$('input[type="date"]', root).forEach(buildCustomDate);
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
    var payload = {
      name: fd.get("name")||"", email: fd.get("email")||"", phone: fd.get("phone")||"",
      event_type: fd.get("event-type")||"", event_date: fd.get("event-date")||"",
      venue: "", guest_count: fd.get("guest-count") ? String(fd.get("guest-count")) : "",
      package: fd.get("package")||"", message: (fd.get("message")||"").trim(), website: ""
    };
    // Optimistic: confirm immediately so the user isn't left waiting on a
    // cold backend (Render free tier can spin up slowly on first hit).
    if (succ){ succ.hidden=false; succ.textContent="Thanks! Your request is in — Bayo will reply shortly with availability and a tailored quote."; succ.style.background=""; succ.style.color=""; }
    if (btn){ btn.disabled = true; btn.dataset.orig = btn.textContent; btn.textContent = "Sent ✓"; }
    fetch(API_INQUIRIES, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) })
      .then(function(r){ if(!r.ok) throw new Error("network"); return r.json(); })
      .then(function(){
        panel.reset(); syncInlineFallback();
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
      venue: fd.get("venue")||"", guest_count: fd.get("guest-count") ? String(fd.get("guest-count")) : "",
      package: fd.get("package")||"", message: composedMessage(fd), website: ""
    };
    var btn = bookingForm.querySelector('button[type="submit"]');
    // Optimistic: confirm immediately so the user isn't left waiting on a
    // cold backend (Render free tier can spin up slowly on first hit).
    if (success){ success.hidden=false;
      success.textContent="Thanks! Your request is in — Bayo will reply shortly with availability and a tailored quote."; success.style.background=""; success.style.color=""; }
    if (btn){ btn.disabled=true; btn.dataset.orig = btn.textContent; btn.textContent="Sent ✓"; }
    fetch(API_INQUIRIES, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) })
      .then(function(r){ if(!r.ok) throw new Error("network"); return r.json(); })
      .then(function(){
        bookingForm.reset(); syncBottomFallback();
      })
      .catch(function(){
        if (success){ success.hidden=false;
          success.textContent="Couldn't send from the site right now — please tap the WhatsApp or email link below and your details will be filled in.";
          success.style.background="rgba(245,110,46,.14)"; success.style.color="#ff8a4d"; }
        if (btn){ btn.disabled=false; btn.textContent = btn.dataset.orig || "Send my request"; }
      });
  });

  // ---------- Enhance native selects + date inputs into custom dropdowns ----------
  // Works in every browser (incl. Instagram/Facebook in-app browsers where
  // native pickers often fail to open). Applied to the bottom form AND the
  // reusable inline panel (cloned from template).
  enhanceAll(bookingForm);
  if (panel) enhanceAll(panel);
  // reflect form reset (panel.reset / bookingForm.reset) back onto custom menus
  [panel, bookingForm].forEach(function(f){
    if (!f) return;
    f.addEventListener("reset", function(){
      setTimeout(function(){
        $$(".custom-dd", f).forEach(function(dd){
          var sel = dd.querySelector("select"); if (sel) sel.dispatchEvent(new Event("reset-dd"));
          var hd = dd.querySelector('input[type="hidden"]'); if (hd) hd.dispatchEvent(new Event("reset-dd"));
        });
      }, 0);
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
