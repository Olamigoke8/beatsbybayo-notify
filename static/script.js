/* BeatsByBayo — redesign JS
   - Sticky header shadow toggle
   - Mobile menu open/close
   - Event card + package button deep-link prefill (writes to full form)
   - Hero mini-quote hands off to full form
   - Add-on chips composed into the message field on submit
   - WhatsApp / email fallback links stay in sync
   - Booking form submit -> /api/inquiries (falls back to WA/email if backend missing)
   - Testimonials loader
*/
(function(){
  "use strict";

  // ---------- API detection ----------
  var API_BASE = "__PORT_8000__";
  if (API_BASE.indexOf("__PORT_8000__") !== -1) {
    // Preview sandbox / production same-origin
    API_BASE = "";
  }
  var API_INQUIRIES    = API_BASE + "/api/inquiries";
  var API_TESTIMONIALS = API_BASE + "/api/testimonials";

  // ---------- Helpers ----------
  function $(sel, ctx){ return (ctx||document).querySelector(sel); }
  function $$(sel, ctx){ return Array.prototype.slice.call((ctx||document).querySelectorAll(sel)); }
  function on(el, ev, fn){ if(el) el.addEventListener(ev, fn); }

  // ---------- Year ----------
  var y = $("#year"); if (y) y.textContent = new Date().getFullYear();

  // ---------- Sticky header shadow ----------
  var hdr = $("#siteHeader");
  function updateHeader(){
    if (!hdr) return;
    if (window.scrollY > 12) hdr.classList.add("is-scrolled");
    else hdr.classList.remove("is-scrolled");
  }
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  // ---------- Mobile menu ----------
  var menu = $("#mobileMenu");
  var toggle = $("#menuToggle");
  var closeBtn = $("#menuClose");
  function setMenu(open){
    if (!menu || !toggle) return;
    if (open){
      menu.classList.add("open");
      menu.setAttribute("aria-hidden","false");
      toggle.classList.add("is-open");
      toggle.setAttribute("aria-expanded","true");
      document.body.style.overflow = "hidden";
    } else {
      menu.classList.remove("open");
      menu.setAttribute("aria-hidden","true");
      toggle.classList.remove("is-open");
      toggle.setAttribute("aria-expanded","false");
      document.body.style.overflow = "";
    }
  }
  on(toggle, "click", function(){ setMenu(!menu.classList.contains("open")); });
  on(closeBtn, "click", function(){ setMenu(false); });
  $$(".mobile-link").forEach(function(a){ on(a, "click", function(){ setMenu(false); }); });

  // ---------- Deep-link prefill for full form ----------
  var eventSelect   = $("#eventTypeSelect");
  var packageSelect = $("#packageSelect");
  var bookingForm   = $("#bookingForm");

  function prefillForm(opts){
    if (!bookingForm) return;
    if (opts.eventType && eventSelect){
      // Try to match option; if none matches, keep dropdown but we'll still send in message
      var match = Array.prototype.find.call(eventSelect.options, function(o){ return o.value === opts.eventType || o.textContent === opts.eventType; });
      if (match) eventSelect.value = match.value || match.textContent;
    }
    if (opts.pkg && packageSelect){
      var pmatch = Array.prototype.find.call(packageSelect.options, function(o){ return o.value === opts.pkg; });
      if (pmatch) packageSelect.value = pmatch.value;
    }
    if (opts.name){
      var nameEl = bookingForm.querySelector('[name="name"]');
      if (nameEl && !nameEl.value) nameEl.value = opts.name;
    }
    if (opts.date){
      var dateEl = bookingForm.querySelector('[name="event-date"]');
      if (dateEl && !dateEl.value) dateEl.value = opts.date;
    }
    // Focus first empty required field
    var firstEmpty = $$("input[required], select[required]", bookingForm).filter(function(el){ return !el.value; })[0];
    if (firstEmpty){
      // Focus after scroll settles
      setTimeout(function(){ firstEmpty.focus({ preventScroll: true }); }, 500);
    }
  }

  // Event cards
  $$("[data-event]").forEach(function(el){
    on(el, "click", function(){
      prefillForm({ eventType: el.getAttribute("data-event") });
    });
  });
  // Package buttons
  $$("[data-pkg]").forEach(function(el){
    on(el, "click", function(){
      prefillForm({ pkg: el.getAttribute("data-pkg") });
    });
  });

  // ---------- Hero mini-quote -> full form ----------
  var mini = $("#miniQuote");
  on(mini, "submit", function(e){
    e.preventDefault();
    var fd = new FormData(mini);
    if (fd.get("website")) return; // honeypot
    prefillForm({
      name: fd.get("name"),
      date: fd.get("event-date"),
      eventType: fd.get("event-type"),
    });
    // Scroll to the full form
    var quote = $("#quote");
    if (quote) quote.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---------- Compose add-on chips into message ----------
  function composedMessage(fd){
    var addons = fd.getAll("addon");
    var base = (fd.get("message") || "").trim();
    if (addons.length){
      var line = "Add-ons requested: " + addons.join(", ") + ".";
      base = base ? (base + "\n\n" + line) : line;
    }
    return base;
  }

  // ---------- WhatsApp / email fallbacks ----------
  function buildFallbackText(fd){
    var lines = ["Hi Bayo, requesting a quote via BeatsByBayo:"];
    var fields = [
      ["Name", fd.get("name")],
      ["Email", fd.get("email")],
      ["Phone", fd.get("phone")],
      ["Event", fd.get("event-type")],
      ["Date", fd.get("event-date")],
      ["Venue", fd.get("venue")],
      ["Guests", fd.get("guest-count")],
      ["Package", fd.get("package")],
    ];
    fields.forEach(function(pair){
      if (pair[1]) lines.push(pair[0] + ": " + pair[1]);
    });
    var addons = fd.getAll("addon");
    if (addons.length) lines.push("Add-ons: " + addons.join(", "));
    var msg = (fd.get("message") || "").trim();
    if (msg) lines.push("\nNotes: " + msg);
    return lines.join("\n");
  }

  function syncFallback(){
    if (!bookingForm) return;
    var fd = new FormData(bookingForm);
    var body = buildFallbackText(fd);
    var wa = "https://wa.me/17047042179?text=" + encodeURIComponent(body);
    var mailto = "mailto:beatsbybayo@gmail.com?subject=" +
      encodeURIComponent("Quote request — " + (fd.get("event-type") || "BeatsByBayo")) +
      "&body=" + encodeURIComponent(body);
    var waBtn    = $("#whatsappBtn");   if (waBtn) waBtn.href = wa;
    var mailBtn  = $("#emailBtn");      if (mailBtn) mailBtn.href = mailto;
    var waQuick  = $("#waQuick");       if (waQuick) waQuick.href = wa;
  }
  if (bookingForm){
    ["input","change"].forEach(function(ev){
      bookingForm.addEventListener(ev, syncFallback);
    });
    syncFallback();
  }

  // ---------- Booking form submit ----------
  on(bookingForm, "submit", function(e){
    e.preventDefault();
    var success = $("#formSuccess");
    var fd = new FormData(bookingForm);
    if (fd.get("website")){ // honeypot
      return;
    }
    var payload = {
      name:         fd.get("name") || "",
      email:        fd.get("email") || "",
      phone:        fd.get("phone") || "",
      event_type:   fd.get("event-type") || "",
      event_date:   fd.get("event-date") || "",
      venue:        fd.get("venue") || "",
      guest_count:  fd.get("guest-count") ? Number(fd.get("guest-count")) : null,
      package:      fd.get("package") || "",
      message:      composedMessage(fd),
      website:      ""
    };
    var btn = bookingForm.querySelector('button[type="submit"]');
    if (btn){ btn.disabled = true; btn.dataset.orig = btn.textContent; btn.textContent = "Sending…"; }

    fetch(API_INQUIRIES, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function(r){
      if (!r.ok) throw new Error("network");
      return r.json();
    }).then(function(){
      if (success){
        success.hidden = false;
        success.textContent = "Thanks! Your request is in — Bayo will reply shortly with availability and a tailored quote.";
      }
      bookingForm.reset();
      syncFallback();
      if (btn){ btn.disabled = false; btn.textContent = btn.dataset.orig || "Send my request"; }
    }).catch(function(){
      if (success){
        success.hidden = false;
        success.textContent = "Couldn't send from the site right now — please tap the WhatsApp or email link below and your details will be filled in.";
        success.style.background = "rgba(178,106,47,.14)";
        success.style.color = "#b26a2f";
      }
      if (btn){ btn.disabled = false; btn.textContent = btn.dataset.orig || "Send my request"; }
    });
  });

  // ---------- Testimonials ----------
  function loadTestimonials(){
    var wrap = $("#testimonialList");
    if (!wrap) return;
    fetch(API_TESTIMONIALS)
      .then(function(r){ if (!r.ok) throw new Error("no api"); return r.json(); })
      .then(function(data){
        var items = (data && data.testimonials) || (Array.isArray(data) ? data : []);
        if (!items.length) return; // leave empty state
        wrap.innerHTML = "";
        items.slice(0, 6).forEach(function(t){
          var card = document.createElement("article");
          card.className = "review-card";
          var stars = "★★★★★".slice(0, Math.max(1, Math.min(5, t.rating || 5)));
          card.innerHTML =
            '<div class="review-stars" aria-label="' + (t.rating || 5) + ' out of 5 stars">' + stars + '</div>' +
            '<p class="review-body">"' + (t.testimonial || "").replace(/</g,"&lt;") + '"</p>' +
            '<p class="review-name">— ' + (t.name || "Client").replace(/</g,"&lt;") +
            (t.event_type ? ' · ' + t.event_type.replace(/</g,"&lt;") : "") + '</p>';
          wrap.appendChild(card);
        });
      })
      .catch(function(){ /* leave empty state */ });
  }
  loadTestimonials();

})();
