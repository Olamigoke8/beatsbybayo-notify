/* ============================================================
   BeatsByBayo — interactions
   - theme toggle
   - scroll-aware header + active nav tab
   - booking form -> prefilled WhatsApp / Email (no backend, no third-party form service)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Theme toggle ---------- */
  (function () {
    var root = document.documentElement;
    var toggle = document.querySelector('[data-theme-toggle]');
    var current = 'dark';
    root.setAttribute('data-theme', current);
    setIcon(current);

    if (toggle) {
      toggle.addEventListener('click', function () {
        current = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', current);
        setIcon(current);
      });
    }

    function setIcon(mode) {
      if (!toggle) return;
      toggle.setAttribute('aria-label', 'Switch to ' + (mode === 'dark' ? 'light' : 'dark') + ' mode');
      toggle.innerHTML =
        mode === 'dark'
          ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
          : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
  })();

  /* ---------- Header shadow + active nav ---------- */
  var header = document.getElementById('header');
  var sections = ['top', 'about', 'packages', 'gallery', 'reviews', 'mixes', 'book']
    .map(function (id) {
      return document.getElementById(id);
    })
    .filter(Boolean);
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-tabs a'));

  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
    var pos = window.scrollY + window.innerHeight * 0.35;
    var activeId = sections[0] ? sections[0].id : null;
    sections.forEach(function (sec) {
      if (sec.offsetTop <= pos) activeId = sec.id;
    });
    tabs.forEach(function (a) {
      var match = a.getAttribute('href') === '#' + (activeId === 'top' ? 'top' : activeId);
      a.classList.toggle('active', match);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ---------- Preselect package from package buttons ---------- */
  var select = document.getElementById('packageSelect');
  Array.prototype.forEach.call(document.querySelectorAll('[data-pkg]'), function (link) {
    link.addEventListener('click', function () {
      if (!select) return;
      var val = link.getAttribute('data-pkg');
      Array.prototype.forEach.call(select.options, function (opt) {
        opt.selected = opt.value === val;
      });
    });
  });

  /* ---------- Footer year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Booking form ---------- */
  var form = document.getElementById('bookingForm');
  var success = document.getElementById('formSuccess');
  var WHATSAPP = '17047042179';
  var EMAIL = 'beatsbybayo@gmail.com';

  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }

  // Selected add-ons (chips) get composed into the message so the backend
  // schema stays unchanged.
  function addonText() {
    var chips = form.querySelectorAll('input[name="addon"]:checked');
    var arr = [];
    Array.prototype.forEach.call(chips, function (c) { arr.push(c.value); });
    return arr.length ? arr.join(', ') : '';
  }
  function composedMessage() {
    var base = val('message');
    var ad = addonText();
    if (!ad) return base;
    var note = 'Add-ons: ' + ad;
    return base ? base + '\n' + note : note;
  }

  function buildMessage() {
    var lines = [];
    lines.push('New event request — BeatsByBayo');
    lines.push('');
    lines.push('Name: ' + val('name'));
    lines.push('Email: ' + val('email'));
    lines.push('Phone: ' + val('phone'));
    lines.push('Event type: ' + val('event-type'));
    lines.push('Event date: ' + val('event-date'));
    lines.push('Venue / location: ' + val('venue'));
    if (val('guest-count')) lines.push('Guest count: ' + val('guest-count'));
    lines.push('Package interest: ' + (val('package') || 'Not selected'));
    if (composedMessage()) {
      lines.push('');
      lines.push('Notes: ' + composedMessage());
    }
    return lines.join('\n');
  }

  function validate() {
    var required = ['name', 'email', 'phone', 'event-type', 'event-date', 'venue'];
    var ok = true;
    required.forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (el && !el.value.trim()) {
        ok = false;
        if (el) el.style.borderColor = 'var(--color-orange)';
      } else if (el) {
        el.style.borderColor = '';
      }
    });
    var email = val('email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ok = false;
    return ok;
  }

  function showSuccess(channel) {
    if (!success) return;
    success.hidden = false;
    success.textContent =
      'Opening ' + channel + ' with your details. If nothing happened, call or text 704-704-2179 directly.';
  }

  // API endpoint — if served same-origin (Render / beatsbybayo.com), use a
  // relative path; otherwise the __PORT_8000__ token is rewritten to the
  // sandbox proxy by deploy_website for the Perplexity preview.
  var API = '__PORT_8000__/api/inquiries';
  if (API.indexOf('__PORT_8000__') !== -1) { API = '/api/inquiries'; }

  function showMsg(text, ok) {
    if (!success) return;
    success.hidden = false;
    success.className = 'form-success ' + (ok ? 'ok' : 'err');
    success.textContent = text;
  }

  function payload() {
    return {
      name: val('name'),
      email: val('email'),
      phone: val('phone'),
      event_type: val('event-type'),
      event_date: val('event-date'),
      venue: val('venue'),
      guest_count: val('guest-count'),
      package: val('package'),
      message: composedMessage(),
      website: val('website'), // honeypot
    };
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) {
        showMsg('Please complete the highlighted fields.', false);
        return;
      }
      var btn = form.querySelector('[type="submit"]');
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Sending…'; }
      showMsg('Sending your request…', false);

      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (res) {
          if (res.data && res.data.ok) {
            form.reset();
            showMsg('Request sent. Bayo will reach out shortly. For anything urgent, call or text 704-704-2179.', true);
          } else {
            throw new Error('not ok');
          }
        })
        .catch(function () {
          // Fallback: open WhatsApp with the details so the lead is never lost.
          var msg = buildMessage();
          var url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg);
          showMsg('Could not reach the server — opening WhatsApp instead. If nothing happens, call or text 704-704-2179.', false);
          window.open(url, '_blank', 'noopener');
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Send my request'; }
        });
    });

    // Manual fallback buttons (WhatsApp / email)
    var waBtn = document.getElementById('whatsappBtn');
    if (waBtn) {
      waBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!validate()) { showMsg('Please complete the highlighted fields.', false); return; }
        window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(buildMessage()), '_blank', 'noopener');
      });
    }
    var emailBtn = document.getElementById('emailBtn');
    if (emailBtn) {
      emailBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!validate()) { showMsg('Please complete the highlighted fields.', false); return; }
        var msg = buildMessage();
        var subject = 'Event request — ' + val('event-type') + ' — ' + val('event-date');
        window.location.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg);
      });
    }

    // One-tap WhatsApp quick lead — works even before the whole form is filled.
    var waQuick = document.getElementById('waQuick');
    if (waQuick) {
      waQuick.addEventListener('click', function (e) {
        e.preventDefault();
        var parts = ['Hi Bayo! I\'d like to check availability'];
        var et = val('event-type'), ed = val('event-date'), gc = val('guest-count'), v = val('venue');
        if (et) parts.push('for a ' + et);
        if (ed) parts.push('on ' + ed);
        if (gc) parts.push('(~' + gc + ' guests)');
        if (v) parts.push('at ' + v);
        var msg = parts.join(' ') + '.';
        window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
        if (success) { success.hidden = false; success.className = 'form-success ok'; success.textContent = 'Opening WhatsApp — Bayo will reply there shortly.'; }
      });
    }
  }

  /* ---------- Mobile full-screen menu ---------- */
  var _menuToggle = document.getElementById('menuToggle');
  var _mobileMenu = document.getElementById('mobileMenu');
  if (_menuToggle && _mobileMenu) {
    var _menuClose = document.getElementById('menuClose');
    function _openMenu() {
      _mobileMenu.classList.add('is-open');
      _mobileMenu.setAttribute('aria-hidden', 'false');
      _menuToggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
      document.body.style.overflow = 'hidden';
    }
    function _closeMenu() {
      _mobileMenu.classList.remove('is-open');
      _mobileMenu.setAttribute('aria-hidden', 'true');
      _menuToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      document.body.style.overflow = '';
    }
    _menuToggle.addEventListener('click', function () {
      if (_mobileMenu.classList.contains('is-open')) _closeMenu(); else _openMenu();
    });
    if (_menuClose) _menuClose.addEventListener('click', _closeMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _mobileMenu.classList.contains('is-open')) _closeMenu();
    });
    Array.prototype.forEach.call(_mobileMenu.querySelectorAll('a'), function (a) {
      a.addEventListener('click', _closeMenu);
    });
  }

  /* ---------- Events tabs ---------- */
  (function () {
    var tabs = document.querySelectorAll('.events-tab');
    var panels = document.querySelectorAll('.events-panel');
    if (!tabs.length) return;
    function activate(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var pid = tab.getAttribute('aria-controls');
      panels.forEach(function (p) {
        var on = p.id === pid;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { activate(t); });
    });
    var deep = { '#corporate': 'tab-corporate', '#weddings': 'tab-weddings', '#fifty-plus': 'tab-fifty' };
    function deepLink() {
      var tid = deep[location.hash];
      if (!tid) return;
      var tab = document.getElementById(tid);
      var ev = document.getElementById('events');
      if (!tab || !ev) return;
      activate(tab);
      ev.scrollIntoView({ behavior: 'smooth' });
    }
    window.addEventListener('hashchange', deepLink);
    deepLink();
  })();

  /* ---------- Testimonials (public, approved only) ---------- */
  (function () {
    var el = document.getElementById('testimonialList');
    if (!el) return;
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function renderEmpty() {
      el.innerHTML = '<p class="reviews-empty">Client stories coming soon — be the first to share yours. <a href="/review.html">Leave a review</a>.</p>';
    }
    fetch('/api/testimonials').then(function (r) { return r.json(); }).then(function (data) {
      var items = (data && data.testimonials) || [];
      if (!items.length) { renderEmpty(); return; }
      el.innerHTML = items.map(function (t) {
        var r = Math.max(1, Math.min(5, parseInt(t.rating || 5, 10) || 5));
        var stars = '★'.repeat(r) + '☆'.repeat(5 - r);
        return '<figure class="review-card"><div class="review-stars">' + stars + '</div><blockquote>' + esc(t.testimonial) + '</blockquote><figcaption><strong>' + esc(t.name) + '</strong>' + (t.event_type ? '<span>' + esc(t.event_type) + '</span>' : '') + '</figcaption></figure>';
      }).join('');
    }).catch(renderEmpty);
  })();

  /* ---------- Package vertical tabs ---------- */
  (function () {
    var tabs = document.querySelectorAll('.pkg-vtab');
    var panels = document.querySelectorAll('.pkg-vtab-content');
    if (!tabs.length) return;
    function activate(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var pid = tab.getAttribute('aria-controls');
      panels.forEach(function (p) {
        var on = p.id === pid;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { activate(t); }); });
    // Deep-link: ?pkg=signature preselects a package tab.
    var m = /pkg=([a-z]+)/i.exec(location.search);
    if (m) {
      var tab = document.getElementById('pkgtab-' + m[1]);
      if (tab) activate(tab);
    }
  })();

  /* ---------- Add-on chip highlight (broad-browser support) ---------- */
  (function () {
    var chips = document.querySelectorAll('.chip input[type="checkbox"]');
    Array.prototype.forEach.call(chips, function (box) {
      function sync() { if (box.closest) box.closest('.chip').classList.toggle('is-checked', box.checked); }
      sync();
      box.addEventListener('change', sync);
    });
  })();

  /* ---------- Last-minute inline form ---------- */
  (function () {
    var toggle = document.getElementById('lastminToggle');
    var form = document.getElementById('lastminForm');
    if (!toggle || !form) return;
    var success = document.getElementById('lastminSuccess');
    toggle.addEventListener('click', function () {
      var open = form.hidden;
      form.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    }
    function validate() {
      var ok = true;
      ['name', 'email', 'phone', 'event-date', 'venue'].forEach(function (n) {
        var el = form.querySelector('[name="' + n + '"]');
        if (el && !el.value.trim()) { ok = false; el.style.borderColor = 'var(--color-orange)'; }
        else if (el) { el.style.borderColor = ''; }
      });
      var em = val('email');
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) ok = false;
      return ok;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (val('website')) return; // honeypot
      if (!validate()) {
        if (success) { success.hidden = false; success.className = 'form-success err'; success.textContent = 'Please complete the highlighted fields.'; }
        return;
      }
      var btn = form.querySelector('[type="submit"]');
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Sending…'; }
      if (success) { success.hidden = false; success.className = 'form-success'; success.textContent = 'Sending your last-minute request…'; }
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: val('name'), email: val('email'), phone: val('phone'),
          event_type: val('event-type') || 'Last-Minute',
          event_date: val('event-date'), venue: val('venue'),
          package: val('package') || 'Last-Minute (within 14 days)',
          message: val('message'), website: val('website')
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (res) {
          if (res.data && res.data.ok) {
            form.reset();
            if (success) { success.hidden = false; success.className = 'form-success ok'; success.textContent = 'Last-minute request sent. Bayo will reach out shortly. For anything urgent, call or text 704-704-2179.'; }
          } else { throw new Error('not ok'); }
        })
        .catch(function () {
          var url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(
            'Hi Bayo! Last-minute DJ request — ' + val('name') + ', ' + val('event-date') + ' at ' + val('venue') + '.'
          );
          if (success) { success.hidden = false; success.className = 'form-success err'; success.textContent = 'Could not reach the server — opening WhatsApp instead. If nothing happens, call or text 704-704-2179.'; }
          window.open(url, '_blank', 'noopener');
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Send last-minute request'; }
        });
    });
  })();

})();
