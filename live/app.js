// ERA Live: the viewer, the setup page and the landing wall
(function () {
  'use strict';
  var ID_RE = /^[A-Za-z0-9_-]{11}$/;
  var BAR = 26, GAP = 4, MAX_CAMS = 12, MIN_W = 160;
  var LIVE_TOL = 12;            // seconds behind the live edge that still count as "live"
  var DVR_MAX = 12 * 3600;      // YouTube keeps at most 12 h of a live stream seekable
  var $ = function (id) { return document.getElementById(id); };
  var svg = function (body, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>'; };
  var ICON = {
    sound: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
    muted: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'),
    expand: svg('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'),
    close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    ok: svg('<circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16 9.5"/>', 'ok'),
    bad: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="7.5" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.6"/>', 'bad'),
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>',
    fsOn: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
    fsOff: svg('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>')
  };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var has = function (o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); };
  // control and bidi-override characters never reach a title or a camera name: they could fake text on screen
  var CTRL_RE = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
  function clean(s, max) { return String(s || '').replace(CTRL_RE, '').replace(/\s+/g, ' ').trim().slice(0, max); }

  // ================= what stays in this browser =================

  // Only three kinds of entries, never sent anywhere: the YouTube choice, each event's arrangement and
  // whether the tip was shown. Each carries its date and is dropped once it is old (see cookie-uri.html).
  var DAY = 864e5;
  var CONSENT_KEY = 'era-live:consent', HINT_KEY = 'era-live:hint', NOTICE_KEY = 'era-live:notice';
  // raise when the consent text changes, so everyone is asked again
  // (2: the cookie question is separate from the terms, with Refuz and Accept side by side)
  var CONSENT_V = 2;
  var KEEP = { consent: 182 * DAY, hint: 365 * DAY, notice: 365 * DAY, layout: 90 * DAY };
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function store(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: nothing is kept */ }
  }
  (function prune() {
    try {
      // list first: removing an entry can reorder the rest, so a live index would skip some
      var now = Date.now(), keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) {
        if (!k || k.indexOf('era-live:') !== 0) return;
        var v = load(k), ts = v && typeof v === 'object' ? v.ts : null;
        var max = k === CONSENT_KEY ? KEEP.consent : k === HINT_KEY ? KEEP.hint : k === NOTICE_KEY ? KEEP.notice : KEEP.layout;
        if (typeof ts !== 'number' || now - ts > max || ts > now + DAY) localStorage.removeItem(k);
      });
    } catch (e) { /* storage blocked */ }
  })();
  // the YouTube choice: { v, yt: true (accepted) | false (refused), ts }, or null if not made yet
  function consentChoice() { var c = load(CONSENT_KEY); return c && c.v === CONSENT_V && typeof c.yt === 'boolean' ? c : null; }
  function hasConsent() { var c = consentChoice(); return !!(c && c.yt); }

  // ================= links =================

  // Any YouTube link form (watch?v=, youtu.be/, /live/, /shorts/, /embed/) or a bare 11-char ID.
  function parseLink(raw) {
    raw = String(raw).trim().replace(/[)\].,;>"']+$/, '').replace(/^[(<"']+/, '');
    if (ID_RE.test(raw)) return raw;
    var u;
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { return null; }
    var host = u.hostname.toLowerCase();
    if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(host)) return null;
    var parts = u.pathname.split('/').filter(Boolean), id = null;
    if (/(^|\.)youtu\.be$/.test(host)) id = parts[0];
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else if (parts.length >= 2 && ['live', 'shorts', 'embed', 'v', 'e'].indexOf(parts[0]) >= 0) id = parts[1];
    return id && ID_RE.test(id) ? id : null;
  }

  // "link  Name", "Name: link", "Name - link": whatever is not the link becomes the camera name.
  function parseLines(text) {
    var cams = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      var raw = line.trim();
      if (!raw) return;
      var tokens = raw.split(/\s+/), id = null, tok = null;
      for (var i = 0; i < tokens.length && !id; i++) { id = parseLink(tokens[i]); tok = tokens[i]; }
      if (!id || cams.some(function (c) { return c.id === id; })) return;
      var name = raw.replace(tok, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—:|,;]+|[\s\-–—:|,;]+$/g, '');
      cams.push({ id: id, name: clean(name, 40) });
    });
    return cams;
  }

  // The event travels after '#': browsers never send that part to a server, so titles, names and stream
  // IDs stay out of every log. Links made before this (with '?') still open.
  function eventUrl(title, list) {
    var p = new URLSearchParams();
    if (title) p.set('t', title);
    list.forEach(function (c) { p.append('c', c.id + (c.name ? '~' + c.name : '')); });
    // per-camera delays (see "delays" below) travel with the link
    list.forEach(function (c) { if (delays[c.id]) p.append('d', c.id + '~' + delays[c.id]); });
    return location.pathname + '#' + p.toString();
  }
  function isEventHash(h) { return /(^|&)(t|c)=/.test(String(h || '').replace(/^#/, '')); }

  // broadcast-style timecode, hh:mm:ss
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60);
  }

  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }

  var params = new URLSearchParams(isEventHash(location.hash) ? location.hash.slice(1) : location.search);
  // opening another event (only the part after '#' changes) starts the page over
  window.addEventListener('hashchange', function () { if (isEventHash(location.hash)) location.reload(); });
  var title = clean(params.get('t'), 120);
  // d=ID~seconds: hold that camera this many seconds behind its live edge, to make up for a stream that
  // reaches YouTube faster than the others (each stream has its own latency, which the page can't see)
  var delays = {};
  params.getAll('d').slice(0, 50).forEach(function (v) {
    var k = v.indexOf('~'), id = v.slice(0, k), sec = parseFloat(v.slice(k + 1));
    if (k > 0 && ID_RE.test(id) && isFinite(sec) && sec > 0) delays[id] = Math.min(30, Math.round(sec * 2) / 2);
  });
  var cams = [];
  params.getAll('c').slice(0, 50).forEach(function (v) {
    var k = v.indexOf('~'), id = k < 0 ? v : v.slice(0, k), name = k < 0 ? '' : clean(v.slice(k + 1), 40);
    if (ID_RE.test(id) && cams.length < MAX_CAMS && !cams.some(function (c) { return c.id === id; })) {
      var n = cams.length + 1;
      cams.push({ id: id, name: name, label: name || 'Camera ' + n, n: n });
    }
  });

  // ================= setup =================

  var rowsEl = $('rows');
  var APPARATUS = ['Bârnă', 'Sol', 'Paralele inegale', 'Sărituri', 'Inele', 'Cal cu mânere', 'Paralele', 'Bară fixă'];
  function rows() { return Array.prototype.slice.call(rowsEl.querySelectorAll('.cam-row')); }

  function addRow(link, name, focus) {
    var r = document.createElement('div');
    r.className = 'cam-row';
    r.innerHTML = '<span class="cam-idx"></span>' +
      '<input class="in name" maxlength="40" autocomplete="off" aria-label="Numele camerei">' +
      '<input class="in link" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://youtube.com/live/…" aria-label="Linkul YouTube">' +
      '<span class="cam-check">' + ICON.ok + ICON.bad + '</span>' +
      '<button type="button" class="rm" aria-label="Șterge camera">' + ICON.close + '</button>';
    r.querySelector('.name').value = name || '';
    r.querySelector('.link').value = link || '';
    rowsEl.appendChild(r);
    renumber();
    if (focus) r.querySelector('.link').focus();
    return r;
  }

  function renumber() {
    rows().forEach(function (r, i) {
      var idx = r.querySelector('.cam-idx');
      idx.textContent = pad2(i + 1);
      r.querySelector('.name').placeholder = APPARATUS[i] ? 'ex. ' + APPARATUS[i] : 'Camera ' + (i + 1);
    });
    $('addRow').hidden = rows().length >= MAX_CAMS;
  }

  function validate() {
    var ok = [], bad = 0, seen = Object.create(null);
    rows().forEach(function (r) {
      var v = r.querySelector('.link').value.trim(), id = v ? parseLink(v) : null, dup = !!(id && seen[id]);
      if (id) seen[id] = true;
      r.classList.toggle('is-ok', !!id && !dup);
      r.classList.toggle('is-bad', !!v && (!id || dup));
      r.querySelector('.cam-check').title = dup ? 'Linkul apare de două ori' : (v && !id ? 'Nu e un link YouTube' : '');
      if (id && !dup) ok.push({ id: id, name: clean(r.querySelector('.name').value, 40) });
      else if (v) bad++;
    });
    var st = $('ready');
    st.className = 'ready' + (bad ? ' bad' : '');
    st.innerHTML = '';
    if (bad) st.textContent = bad === 1 ? 'Un link nu e valid — verifică rândul marcat.' : bad + ' linkuri nu sunt valide — verifică rândurile marcate.';
    else if (ok.length) {
      var b = document.createElement('b');
      b.textContent = ok.length === 1 ? '1 cameră' : ok.length + ' camere';
      st.appendChild(b);
      st.appendChild(document.createTextNode(' gata de transmis'));
    } else st.textContent = 'Adaugă cel puțin un link YouTube.';
    $('create').disabled = !ok.length || bad > 0;
    return { ok: ok, bad: bad };
  }

  rowsEl.addEventListener('input', validate);
  rowsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.rm');
    if (!b) return;
    b.closest('.cam-row').remove();
    if (!rows().length) addRow('', '', true);
    renumber(); validate();
  });
  // a pasted list of links spreads over as many rows as it has links
  rowsEl.addEventListener('paste', function (e) {
    var input = e.target.closest('.link');
    if (!input) return;
    var list = parseLines((e.clipboardData || window.clipboardData).getData('text'));
    if (list.length < 2) return;
    e.preventDefault();
    var r = input.closest('.cam-row');
    list.forEach(function (c, i) {
      if (i > 0) {
        if (rows().length >= MAX_CAMS) return;
        var empty = rows().filter(function (x) { return x !== r && !x.querySelector('.link').value.trim(); })[0];
        r = empty || addRow('', '');
      }
      r.querySelector('.link').value = 'https://youtu.be/' + c.id;
      if (c.name && !r.querySelector('.name').value.trim()) r.querySelector('.name').value = c.name;
    });
    renumber(); validate();
  });
  $('addRow').addEventListener('click', function () { addRow('', '', true); validate(); });
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = validate();
    if (!v.ok.length || v.bad) return;
    var url = eventUrl(clean($('fTitle').value, 120), v.ok.slice(0, MAX_CAMS));
    // the same event as the one open (nothing changed while editing): just go back to it
    if (url === location.pathname + location.hash && onLeaveSetup) onLeaveSetup();
    else location.href = url;
  });

  var onLeaveSetup = null;
  // first visit on the landing: say what is (and isn't) stored; there is nothing to accept here
  function showNotice(on) { $('cnotice').hidden = !on; }
  $('cnoticeOk').addEventListener('click', function () { store(NOTICE_KEY, { ts: Date.now() }); showNotice(false); });

  function showSetup(editing) {
    showNotice(!editing && !load(NOTICE_KEY));
    ['hdr', 'stage', 'dock'].forEach(function (id) { $(id).hidden = true; });
    $('setup').hidden = false;
    $('cancel').hidden = !editing;
    $('fTitle').value = title;
    rowsEl.textContent = '';
    if (cams.length) cams.forEach(function (c) { addRow('https://youtu.be/' + c.id, c.name); });
    else { addRow('', ''); addRow('', ''); }
    validate();
    if (editing) $('creeaza').scrollIntoView(); else window.scrollTo(0, 0);
    document.title = 'ERA Live';
  }
  $('cancel').addEventListener('click', function () { if (onLeaveSetup) onLeaveSetup(); });


  // ---------- landing ----------

  // the example wall directs itself like a vision mixer: every few seconds another camera goes on air
  (function () {
    var wall = $('lw');
    var camEls = Array.prototype.slice.call(wall.querySelectorAll('.lw-cam'));
    var order = camEls.slice();            // order[0] is on air
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var seen = true, lastTouch = 0;

    function onAir(cam, animate) {
      var before = camEls.map(function (c) { return c.getBoundingClientRect(); });
      var i = order.indexOf(cam);
      order = order.slice(i).concat(order.slice(0, i));
      order.forEach(function (c, k) { c.dataset.slot = k; });
      if (!animate || still || !camEls[0].animate) return;
      camEls.forEach(function (c, k) {
        var a = before[k], b = c.getBoundingClientRect();
        if (!b.width || !b.height) return;
        c.animate([
          { transform: 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px) scale(' + a.width / b.width + ',' + a.height / b.height + ')' },
          { transform: 'none' }
        ], { duration: 800, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      });
    }

    wall.addEventListener('click', function (e) {
      var c = e.target.closest('.lw-cam');
      if (!c || c.dataset.slot === '0') return;
      lastTouch = Date.now();
      onAir(c, true);
    });
    setInterval(function () {
      if (still || !seen || document.hidden || $('setup').hidden || Date.now() - lastTouch < 12000) return;
      onAir(order[1], true);
    }, 4600);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }).observe(wall);
    }

    // chalk dust drifting through the light, and a running hh:mm:ss:ff timecode
    var cv = $('lwDust'), ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), dust = [];
    function fit() { var r = wall.getBoundingClientRect(); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    fit();
    window.addEventListener('resize', fit);
    for (var n = 0; n < 48; n++) {
      dust.push({ x: Math.random(), y: Math.random(), r: 0.4 + Math.random() * 1.5, v: 0.000012 + Math.random() * 0.00004, d: (Math.random() - 0.5) * 0.00002, a: 0.06 + Math.random() * 0.2 });
    }
    var t0 = performance.now() - 2472000, last = performance.now();
    function frame(now) {
      var dt = Math.min(64, now - last);
      last = now;
      if (seen && !document.hidden && !$('setup').hidden) {
        if (cv.width !== Math.round(wall.getBoundingClientRect().width * dpr)) fit();
        ctx.clearRect(0, 0, cv.width, cv.height);
        dust.forEach(function (p) {
          p.y -= p.v * dt; p.x += p.d * dt;
          if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
          ctx.beginPath();
          ctx.fillStyle = 'rgba(255, 240, 220, ' + p.a + ')';
          ctx.arc(p.x * cv.width, p.y * cv.height, p.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        });
        var s = (now - t0) / 1000;
        $('lwTc').textContent = fmt(s) + ':' + pad2(Math.floor((s % 1) * 25));
      }
      requestAnimationFrame(frame);
    }
    if (!still) requestAnimationFrame(frame);
  })();

  function toForm() {
    $('creeaza').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    var empty = rows().map(function (r) { return r.querySelector('.link'); }).filter(function (i) { return !i.value.trim(); })[0];
    setTimeout(function () { (empty || $('fTitle')).focus({ preventScroll: true }); }, 700);
  }
  document.querySelectorAll('[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); toForm(); });
  });

  if (!cams.length) { showSetup(false); return; }

  // ================= viewer state (remembered per event, per browser) =================

  var ids = cams.map(function (c) { return c.id; });
  var KEY = 'era-live:' + ids.join(',');
  // sizes: per camera, the share of the stage width it takes in the Liber layout; pos: where it sits there
  var state = { order: ids.slice(), hidden: [], layout: ids.length > 1 ? 'grid' : 'single', focus: ids[0], sizes: {}, pos: {} };
  var num = function (v, lo, hi) { return typeof v === 'number' && v >= lo && v <= hi; };
  try {
    var saved = load(KEY);
    if (saved) {
      // only this event's cameras, each once, whatever the stored value holds
      var known = function (list) {
        var out = [];
        (Array.isArray(list) ? list.slice(0, 50) : []).forEach(function (id) { if (ids.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id); });
        return out;
      };
      var order = known(saved.order);
      ids.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
      state.order = order;
      state.hidden = known(saved.hidden);
      if (state.hidden.length >= ids.length) state.hidden = [];
      if (['grid', 'focus', 'single', 'free'].indexOf(saved.layout) >= 0) state.layout = saved.layout;
      if (ids.indexOf(saved.focus) >= 0) state.focus = saved.focus;
      ids.forEach(function (id) {
        var f = has(saved.sizes, id) ? saved.sizes[id] : null;
        if (typeof f === 'number' && f > 0 && f <= 1) state.sizes[id] = f;
        var p = has(saved.pos, id) ? saved.pos[id] : null;
        if (p && num(p.x, 0, 1) && num(p.y, -2, 50) && num(p.b, -5000, 5000)) state.pos[id] = { x: p.x, y: p.y, b: p.b };
      });
    }
  } catch (e) { /* private mode or a corrupt value: start fresh */ }
  var audio = null;   // never restored: browsers block sound until the viewer taps

  function save() {
    state.ts = Date.now();
    store(KEY, state);
  }

  // ================= players =================

  var stage = $('stage'), tiles = {};
  cams.forEach(function (c) {
    var el = document.createElement('div');
    el.className = 'tile'; el.hidden = true; el.dataset.id = c.id;
    el.innerHTML = '<div class="th"><span class="num"></span><span class="name"></span><span class="aud" hidden>Audio</span>' +
      '<button type="button" class="tbtn" data-act="audio"></button>' +
      '<button type="button" class="tbtn" data-act="focus">' + ICON.expand + '</button>' +
      '<button type="button" class="tbtn" data-act="hide">' + ICON.close + '</button></div>' +
      '<div class="frame" data-wait="Conectare"></div>' +
      '<span class="grip" title="Trage ca să schimbi mărimea"></span>';
    el.querySelector('.num').textContent = pad2(c.n);
    el.querySelector('.name').textContent = c.label;
    var f = el.querySelector('[data-act="focus"]'), h = el.querySelector('[data-act="hide"]');
    f.title = 'Fă-o mare'; f.setAttribute('aria-label', 'Fă-o mare: ' + c.label);
    h.title = 'Ascunde'; h.setAttribute('aria-label', 'Ascunde ' + c.label);
    stage.appendChild(el);
    tiles[c.id] = { id: c.id, cam: c, el: el, frame: el.querySelector('.frame'), iframe: null, player: null, ready: false };
  });

  // The official IFrame API gives us each camera's position and lets us seek them together.
  // If it can't load, cameras still play and the sound buttons still work through plain postMessage.
  var API = { ready: false, failed: false, loading: false, pending: [] };
  window.onYouTubeIframeAPIReady = function () {
    API.ready = true; API.failed = false;
    API.pending.splice(0).forEach(attach);
  };
  // nothing is requested from YouTube until the viewer agrees (see the gate below)
  var consented = hasConsent();
  function loadAPI() {
    if (API.loading) return;
    API.loading = true;
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = function () { API.failed = true; tick(); };
    document.head.appendChild(s);
    setTimeout(function () { if (!API.ready) { API.failed = true; tick(); } }, 12000);
  }
  if (consented) loadAPI();

  function mount(t) {
    if (t.iframe || !consented) return;
    var f = document.createElement('iframe');
    // muted autoplay is the only autoplay browsers allow; YouTube's own controls are replaced by the dock
    var q = 'autoplay=1&mute=1&playsinline=1&controls=0&disablekb=1&rel=0&iv_load_policy=3&fs=0&enablejsapi=1';
    if (location.origin && location.origin !== 'null') q += '&origin=' + encodeURIComponent(location.origin);
    f.src = 'https://www.youtube.com/embed/' + t.id + '?' + q;
    f.title = t.cam.label;
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    // YouTube refuses embeds that arrive without a referrer
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    t.frame.appendChild(f);
    t.iframe = f;
    attach(t);
  }

  function attach(t) {
    if (!t.iframe || t.player) return;
    if (!API.ready || !window.YT || !YT.Player) { if (API.pending.indexOf(t) < 0) API.pending.push(t); return; }
    t.player = new YT.Player(t.iframe, {
      events: {
        onReady: function () { t.ready = true; playerReady(t); },
        onStateChange: function (e) { onState(t, e.data); }
      }
    });
  }

  // a hidden camera is torn down, not just hidden, so it stops using bandwidth
  function unmount(t) {
    if (!t.iframe) return;
    if (t.player) { try { t.player.destroy(); } catch (e) { /* already gone */ } }
    if (t.iframe && t.iframe.parentNode) t.iframe.remove();
    t.iframe = null; t.player = null; t.ready = false; t.prevDur = null; t.growing = false;
    t.edge0 = null; t.edgeT = 0; t.pendingBehind = null; t.recalibUntil = 0; t.nextCheck = 0; t.stuckSince = 0; t.overSince = 0; t.jumpAt = 0; t.played = false;
    if (audio === t.id) audio = null;
  }

  function cmd(t, fn, args) {
    if (t.ready && t.player && typeof t.player[fn] === 'function') {
      try { return t.player[fn].apply(t.player, args || []); } catch (e) { return null; }
    }
    if (t.iframe && t.iframe.contentWindow) {
      t.iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: fn, args: args || [] }), 'https://www.youtube.com');
    }
    return null;
  }

  function get(t, fn) {
    if (!t.ready || !t.player || typeof t.player[fn] !== 'function') return null;
    try { return t.player[fn](); } catch (e) { return null; }
  }

  function readyTiles() { return visible().map(function (id) { return tiles[id]; }).filter(function (t) { return t.ready; }); }

  // the camera the timeline follows: the big one if it is ready, otherwise the first ready one
  function refTile(except) {
    var list = readyTiles().filter(function (t) { return t !== except; });
    return list.filter(function (t) { return t.id === state.focus; })[0] || list[0] || null;
  }

  // On a live, getDuration() only counts the time since this player loaded, so it can't say where the
  // live edge is (using it sent "back 10 s" to the start of the stream). getCurrentTime() and seekTo()
  // do share the stream's own timeline, so each camera's live edge is learned from where YouTube starts
  // playing it, then moved forward with the clock.
  function dl(t) { return delays[t.id] || 0; }
  function nowS() { return performance.now() / 1000; }

  function edgeOf(t) {
    if (t.edge0 == null) return null;
    var e = t.edge0 + (nowS() - t.edgeT), c = get(t, 'getCurrentTime');
    // playback can never be ahead of the live edge; if it is, the estimate was low
    if (c && c > e) { t.edge0 = c; t.edgeT = nowS(); e = c; }
    return e;
  }

  function onState(t, s) {
    dbgLog(t, 'stare ' + stateName(s));
    // a jump to LIVE that the player took as "past the end": a fresh load always starts at the live edge
    if (s === 0 && nowS() - (t.jumpAt || 0) < 15) { t.jumpAt = 0; reload(t); return; }
    if (s === 1) {
      if (!t.played) { t.played = true; startTogether(); }
      var c = get(t, 'getCurrentTime');
      // the first time a camera plays, YouTube has put it at the live edge; after LIVE was pressed, likewise
      if (c && (t.edge0 == null || nowS() < (t.recalibUntil || 0))) { t.edge0 = c; t.edgeT = nowS(); t.recalibUntil = 0; }
      // a camera that appeared while everyone was rewound joins them now that its edge is known
      if (t.pendingBehind != null && t.edge0 != null) {
        var b = t.pendingBehind;
        t.pendingBehind = null;
        cmd(t, 'seekTo', [Math.max(0, edgeOf(t) - b), true]);
      }
    }
    tick();
  }

  function isLive(t) {
    var d = get(t, 'getVideoData');
    if (d && typeof d.isLive === 'boolean') return d.isLive;
    return !!t.growing;
  }

  function playerReady(t) {
    if (audio === t.id) { cmd(t, 'unMute'); cmd(t, 'setVolume', [100]); } else cmd(t, 'mute');
    // a camera that appears while everyone is rewound joins them instead of starting at the live edge
    if (tl.mode === 'live' && tl.behind > LIVE_TOL) {
      t.pendingBehind = tl.behind + dl(t);
    } else if (dl(t)) {
      t.pendingBehind = dl(t);
    } else if (tl.mode === 'vod' && tl.shifted) {
      // only once the viewer has moved through the replay; before that every camera simply starts with the others
      var r = refTile(t), c = r && get(r, 'getCurrentTime');
      if (c != null) cmd(t, 'seekTo', [c, true]);
    }
    cmd(t, tl.paused ? 'pauseVideo' : 'playVideo');
    tick();
  }

  function setAudio(id) {
    audio = id;
    ids.forEach(function (x) {
      var t = tiles[x];
      if (!t.iframe) return;
      if (x === id) { cmd(t, 'unMute'); cmd(t, 'setVolume', [100]); }
      else cmd(t, 'mute');
    });
    paint();
  }

  // ================= shared timeline: every camera moves together =================

  var tl = { mode: 'none', behind: 0, want: 0, window: 0, paused: false, dragging: false, shifted: false };
  // the timeline's range: live = seconds relative to the live edge (-window .. 0), replay = 0 .. duration
  var scrub = $('tl'), tip = $('tlTip');
  var range = { min: 0, max: 0, value: 0, disabled: true };

  function scrubLabel(v) { return tl.mode === 'live' ? liveLabel(-v) : fmt(v); }

  function setRange(min, max, value, disabled) {
    range.min = min; range.max = max; range.disabled = disabled;
    if (!tl.dragging) range.value = value;
    paintScrub();
  }

  function paintScrub() {
    var span = range.max - range.min, f = span > 0 ? (range.value - range.min) / span : 1;
    scrub.style.setProperty('--p', Math.max(0, Math.min(1, f)) * 100 + '%');
    scrub.classList.toggle('is-disabled', range.disabled);
    scrub.tabIndex = range.disabled ? -1 : 0;
    scrub.setAttribute('aria-disabled', String(range.disabled));
    scrub.setAttribute('aria-valuemin', String(Math.round(range.min)));
    scrub.setAttribute('aria-valuemax', String(Math.round(range.max)));
    scrub.setAttribute('aria-valuenow', String(Math.round(range.value)));
    scrub.setAttribute('aria-valuetext', tl.mode === 'none' ? 'indisponibil' : scrubLabel(range.value));
  }

  function setStatus(kind, text) {
    var s = $('status');
    s.className = 'tally' + (kind ? ' is-' + kind : '');
    $('statusTxt').textContent = text;
  }

  function liveLabel(behind) { return behind <= LIVE_TOL ? 'LIVE' : '−' + fmt(behind); }

  function tick() {
    var ready = readyTiles();
    ready.forEach(function (t) {
      var d = get(t, 'getDuration');
      if (d != null && t.prevDur != null && d > t.prevDur + 0.4) t.growing = true;
      t.prevDur = d;
    });
    var r = refTile();
    var playing = ready.some(function (t) { var s = get(t, 'getPlayerState'); return s === 1 || s === 3; });
    paintPlay(r ? playing : !tl.paused);
    var canSeek = !!r && !API.failed;
    ['back30', 'back10', 'fwd10'].forEach(function (id) { $(id).disabled = !canSeek; });
    if (!r) {
      tl.mode = 'none';
      setRange(0, 0, 0, true);
      $('tlLeft').textContent = '--:--:--'; $('tlLeft').className = 'tc'; $('tlRight').textContent = '';
      $('goLive').hidden = true;
      if (API.failed) setStatus('', 'LIVE');
      else setStatus('', 'CONECTARE');
      return;
    }
    var cur = get(r, 'getCurrentTime') || 0, dur = get(r, 'getDuration') || 0;
    if (ready.some(isLive)) {
      tl.mode = 'live';
      // follow a camera whose live edge is already known
      var lr = edgeOf(r) != null ? r : ready.filter(function (t) { return edgeOf(t) != null; })[0];
      if (!lr) {
        tl.window = 0;
        setRange(0, 0, 0, true);
        ['back30', 'back10', 'fwd10'].forEach(function (id) { $(id).disabled = true; });
        $('tlLeft').textContent = 'LIVE'; $('tlLeft').className = 'tc is-live'; $('tlRight').textContent = '';
        $('goLive').hidden = true;
        setStatus('', 'CONECTARE');
        return;
      }
      var edge = edgeOf(lr);
      cur = get(lr, 'getCurrentTime') || 0;
      // YouTube keeps at most 12 h of a live seekable, counted back from the edge
      tl.window = Math.min(edge, DVR_MAX);
      if (!tl.dragging) tl.behind = Math.min(Math.max(0, edge - cur - dl(lr)), tl.window);
      setRange(-Math.round(tl.window), 0, -Math.round(tl.behind), tl.window < 5);
      var at = tl.behind <= LIVE_TOL;
      $('tlLeft').textContent = tl.dragging ? scrubLabel(range.value) : liveLabel(tl.behind);
      $('tlLeft').className = 'tc' + ((tl.dragging ? -range.value <= LIVE_TOL : at) ? ' is-live' : '');
      $('tlRight').textContent = '';
      $('goLive').hidden = false;
      $('goLive').classList.toggle('at-live', at);
      $('goLive').title = at ? 'Ești la LIVE. Apasă ca să resincronizezi toate camerele' : 'Înapoi la LIVE (End)';
      if (at && playing) setStatus('live', 'LIVE');
      else setStatus('behind', at ? 'PAUZĂ' : liveLabel(tl.behind));
      keepTogether(ready);
    } else {
      tl.mode = 'vod';
      setRange(0, Math.round(dur), Math.round(cur), !dur);
      $('tlLeft').textContent = fmt(tl.dragging ? range.value : cur);
      $('tlLeft').className = 'tc';
      $('tlRight').textContent = fmt(dur);
      $('goLive').hidden = true;
      setStatus('', 'RELUARE');
    }
  }
  setInterval(tick, 500);

  // ---------- diagnostics: add &debug to the link to see how far each camera is from its live edge ----------
  var DEBUG = params.has('debug'), dbgEl = null, dbgLines = [], dbgT0 = nowS();
  function stateName(s) {
    return { '-1': 'nepornit', 0: 'terminat', 1: 'rulează', 2: 'pauză', 3: 'buffering', 5: 'pregătit' }[s] || String(s);
  }
  function f1(v) { return typeof v === 'number' && isFinite(v) ? v.toFixed(1) : '–'; }
  function dbgLog(t, msg) {
    if (!DEBUG) return;
    dbgLines.push('+' + (nowS() - dbgT0).toFixed(1) + 's ' + t.cam.label + ': ' + msg);
    if (dbgLines.length > 60) dbgLines.shift();
  }
  function dbgText() {
    var out = ['ERA Live diagnostic ' + new Date().toISOString(), navigator.userAgent,
      'mod=' + tl.mode + ' înUrmă=' + f1(tl.behind) + ' dorit=' + f1(tl.want) + ' pauză=' + tl.paused + ' API=' + (API.failed ? 'eșuat' : API.ready ? 'ok' : 'încărcare'), ''];
    out.push('cameră | stare | timp | LIVE estimat | în urmă (s) | decalaj | durată | calitate | încărcat | live | salturi | reîncărcări');
    visible().forEach(function (id) {
      var t = tiles[id];
      if (!t.ready) { out.push(t.cam.label + ' | ' + (t.iframe ? 'conectare' : 'neîncărcat')); return; }
      var c = get(t, 'getCurrentTime'), e = edgeOf(t), lf = get(t, 'getVideoLoadedFraction');
      out.push([t.cam.label, stateName(get(t, 'getPlayerState')), f1(c), f1(e), e != null && c != null ? f1(e - c) : '–', f1(dl(t)),
        f1(get(t, 'getDuration')), get(t, 'getPlaybackQuality') || '–', lf != null ? Math.round(lf * 100) + '%' : '–',
        isLive(t) ? 'da' : 'nu', t.jumps || 0, t.reloads || 0].join(' | '));
    });
    return out.concat(['', 'evenimente:'], dbgLines.slice(-25)).join('\n');
  }
  if (DEBUG) {
    dbgEl = document.createElement('div');
    dbgEl.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;max-width:calc(100vw - 16px);max-height:60vh;overflow:auto;' +
      'background:rgba(0,0,0,.85);color:#7CFC9A;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;border-radius:6px;white-space:pre';
    var pre = document.createElement('div'), btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = 'Copiază diagnosticul';
    btn.style.cssText = 'display:inline-block;margin:0 6px 6px 0;font:inherit;padding:4px 8px;cursor:pointer;background:#7CFC9A;color:#000;border:0;border-radius:4px';
    btn.addEventListener('click', function () {
      var txt = dbgText();
      var done = function () { btn.textContent = 'Copiat ✓'; setTimeout(function () { btn.textContent = 'Copiază diagnosticul'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.prompt('Copiază:', txt); });
      else window.prompt('Copiază:', txt);
    });
    // per-camera delay: hold back the cameras that are ahead until every one shows the same moment
    var ctl = document.createElement('div');
    ctl.style.cssText = 'white-space:normal;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #2a5';
    var head = document.createElement('div');
    head.textContent = 'Decalaj pe cameră (ține în urmă camerele care sunt înainte):';
    ctl.appendChild(head);
    var bstyle = 'font:inherit;font-size:16px;font-weight:700;min-width:40px;padding:4px 10px;margin:0 3px;cursor:pointer;' +
      'background:#7CFC9A;color:#000;border:0;border-radius:4px';
    cams.forEach(function (c) {
      var row = document.createElement('div'), name = document.createElement('span'), val = document.createElement('span');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;margin:3px 0';
      name.textContent = c.label; name.style.cssText = 'flex:1;min-width:90px';
      val.style.cssText = 'min-width:44px;text-align:center';
      var show = function () { val.textContent = (delays[c.id] || 0).toFixed(1) + ' s'; };
      var step = function (d) {
        var v = Math.max(0, Math.min(30, (delays[c.id] || 0) + d));
        if (v) delays[c.id] = v; else delete delays[c.id];
        show();
        var t = tiles[c.id];
        dbgLog(t, 'decalaj ' + v.toFixed(1) + ' s');
        if (!t.ready || tl.mode !== 'live') return;
        var e = edgeOf(t);
        if (e != null) { t.recalibUntil = 0; t.nextCheck = nowS() + 4; cmd(t, 'seekTo', [Math.max(0, e - tl.want - v), true]); }
      };
      [['−', -0.5], ['+', 0.5]].forEach(function (x, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = x[0]; b.style.cssText = bstyle;
        b.addEventListener('click', function () { step(x[1]); });
        if (i === 0) { row.appendChild(name); row.appendChild(b); row.appendChild(val); } else row.appendChild(b);
      });
      show();
      ctl.appendChild(row);
    });
    var linkBtn = document.createElement('button');
    linkBtn.type = 'button'; linkBtn.textContent = 'Copiază linkul cu decalaje';
    linkBtn.style.cssText = 'display:block;margin-top:6px;font:inherit;padding:4px 8px;cursor:pointer;background:#7CFC9A;color:#000;border:0;border-radius:4px';
    linkBtn.addEventListener('click', function () {
      var url = location.origin + eventUrl(title, cams);
      var done = function () { linkBtn.textContent = 'Link copiat ✓'; setTimeout(function () { linkBtn.textContent = 'Copiază linkul cu decalaje'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copiază:', url); });
      else window.prompt('Copiază:', url);
    });
    ctl.appendChild(linkBtn);
    dbgEl.appendChild(ctl);
    // the numbers can be folded away so the cameras stay visible on a phone while tuning
    var fold = document.createElement('button');
    fold.type = 'button'; fold.textContent = 'Ascunde detaliile';
    fold.style.cssText = btn.style.cssText;
    fold.addEventListener('click', function () {
      pre.hidden = !pre.hidden;
      fold.textContent = pre.hidden ? 'Arată detaliile' : 'Ascunde detaliile';
    });
    dbgEl.appendChild(btn); dbgEl.appendChild(fold); dbgEl.appendChild(pre);
    document.body.appendChild(dbgEl);
    setInterval(function () { pre.textContent = dbgText(); }, 500);
  }

  // Live watchdog. Cameras were lined up only when they started or when LIVE was pressed, so one that
  // buffered, or was slowed down by the browser (background tab, weak network), stayed behind for good
  // while the others were live. Every few seconds each camera is checked against where the viewer is
  // (LIVE, or the same distance back as the timeline) and put back there if it has drifted; a camera
  // that is stuck (not started, paused by the browser, a stream that only now went live) is restarted.
  var DRIFT_TOL = 4;            // seconds a rewound camera may be off the others before it is moved back
  var CATCHUP_TOL = 3;          // seconds behind the live edge before a camera is brought back to LIVE
  var CATCHUP_HOLD = 2;         // ...for this long in a row, so a momentary dip doesn't cause a seek
  function keepTogether(ready) {
    if (tl.paused || tl.dragging || API.failed) return;
    // judged against where the viewer asked to be, not the followed camera, which may be the one lagging
    var now = nowS(), want = tl.want, atLive = want <= LIVE_TOL;
    ready.forEach(function (t) {
      if (now < (t.nextCheck || 0)) return;
      var s = get(t, 'getPlayerState');
      if (s === 0) return;      // this stream has ended: leave it
      if (s !== 1 && s !== 3) {
        // not playing although the viewer didn't pause: nudge it, and reload it if it stays stuck
        t.stuckSince = t.stuckSince || now;
        t.nextCheck = now + 5;
        if (now - t.stuckSince > 40) { t.stuckSince = 0; reload(t); }
        else cmd(t, 'playVideo');
        return;
      }
      t.stuckSince = 0;
      if (s !== 1) return;      // buffering: give it time, it is checked again once it plays
      var e = edgeOf(t), c = get(t, 'getCurrentTime');
      var target = want + dl(t);
      if (e == null) { t.pendingBehind = target || null; return; }
      if (c == null) return;
      var lag = e - c;
      if (atLive && !dl(t)) {
        if (lag <= CATCHUP_TOL) { t.overSince = 0; return; }
        t.overSince = t.overSince || now;
        if (now - t.overSince < CATCHUP_HOLD) return;
        t.overSince = 0;
        jumpToLive(t);
      } else {
        if (Math.abs(lag - target) <= (atLive ? 1.5 : DRIFT_TOL)) return;
        cmd(t, 'seekTo', [Math.max(0, e - target), true]);
      }
      t.nextCheck = now + 10;   // let the seek settle before judging this camera again
    });
  }

  // tear a camera down and load it again, keeping its sound if it had it
  function reload(t) {
    var had = audio === t.id;
    t.reloads = (t.reloads || 0) + 1; dbgLog(t, 'reîncărcare');
    unmount(t);
    if (had) audio = t.id;
    mount(t);
  }

  // coming back to the tab: browsers slow down background videos, so line everyone up at once
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    ids.forEach(function (id) { tiles[id].nextCheck = 0; });
    tick();
  });

  function paintPlay(playing) {
    var b = $('playAll');
    b.innerHTML = playing ? ICON.pause : ICON.play;
    b.setAttribute('aria-label', playing ? 'Pauză la toate camerele' : 'Pornește toate camerele');
  }

  function eachMounted(fn) { visible().forEach(function (id) { if (tiles[id].iframe) fn(tiles[id]); }); }

  // Live: put every camera the same distance behind its own live edge, which also re-syncs them.
  function goBehind(b) {
    b = Math.max(0, Math.min(b, tl.window || 0));
    tl.behind = b; tl.want = b;
    readyTiles().forEach(function (t) {
      var e = edgeOf(t), target = b + dl(t);
      // to LIVE: jump to the real edge first, then (if this camera has a delay) step back from there
      if (b === 0) { t.pendingBehind = dl(t) || null; jumpToLive(t); return; }
      if (e == null) { t.pendingBehind = target; return; }
      t.recalibUntil = 0;
      cmd(t, 'seekTo', [Math.max(0, e - target), true]);
    });
    if (!tl.paused) eachMounted(function (t) { cmd(t, 'playVideo'); });
    tick();
  }

  // Replay: shift every camera by the same amount, keeping their offsets.
  function shiftAll(sec) {
    tl.shifted = true;
    readyTiles().forEach(function (t) {
      var c = get(t, 'getCurrentTime'), d = get(t, 'getDuration');
      if (c != null) cmd(t, 'seekTo', [Math.max(0, Math.min(d || Infinity, c + sec)), true]);
    });
    tick();
  }

  function seekBy(sec) {
    if (tl.mode === 'live') goBehind(tl.behind - sec);
    else if (tl.mode === 'vod') shiftAll(sec);
  }

  // Cameras load one after the other, each starting wherever YouTube put it at that moment. Once every
  // camera on screen is playing (or 12 s after the first one, if one never comes), they all jump to the
  // live edge in the same instant, so they start out together.
  var startSync = { done: false, first: 0 };
  function startTogether() {
    if (startSync.done) return;
    var now = nowS();
    if (!startSync.first) {
      startSync.first = now;
      setTimeout(startTogether, 12500);
    }
    var vis = visible().map(function (id) { return tiles[id]; });
    var all = vis.every(function (t) { return t.played; });
    if (!all && now - startSync.first < 12) return;
    startSync.done = true;
    // a short wait so the last one to start has some video buffered before the jump
    setTimeout(function () {
      if (tl.mode !== 'live' || tl.paused || tl.want > LIVE_TOL) return;
      if (DEBUG) dbgLines.push('+' + (nowS() - dbgT0).toFixed(1) + 's toate: pornire sincronizată');
      goBehind(0);
    }, 1500);
  }

  // Jump far past the estimated edge: YouTube stops at the real live edge, wherever that is, so this
  // works even when the estimate is off. The edge is then re-learned from where it landed.
  function jumpToLive(t) {
    var e = edgeOf(t), c = get(t, 'getCurrentTime'), now = nowS();
    t.recalibUntil = now + 8; t.jumpAt = now; t.overSince = 0;
    t.jumps = (t.jumps || 0) + 1; dbgLog(t, 'salt la LIVE');
    t.nextCheck = now + 10;
    cmd(t, 'seekTo', [Math.max(e || 0, c || 0) + 3600, true]);
  }

  // LIVE: every camera jumps to its live edge. Pressed again while already at LIVE, every camera is
  // reloaded at once, the surest way to have them all start again from the live edge together.
  function goLive() {
    var again = tl.mode === 'live' && !tl.paused && tl.want <= LIVE_TOL && nowS() - (tl.lastLive || 0) > 1;
    tl.paused = false;
    tl.lastLive = nowS();
    if (again) {
      tl.behind = 0; tl.want = 0;
      startSync = { done: false, first: 0 };
      eachMounted(reload);
      tick();
      return;
    }
    goBehind(0);
  }

  function togglePlay() {
    var ready = readyTiles();
    var playing = ready.length ? ready.some(function (t) { var s = get(t, 'getPlayerState'); return s === 1 || s === 3; }) : !tl.paused;
    tl.paused = playing;
    // resuming a live after a pause: stay where it was paused, the watchdog keeps everyone there
    if (!playing) tl.want = tl.behind;
    eachMounted(function (t) { cmd(t, playing ? 'pauseVideo' : 'playVideo'); });
    paintPlay(!playing);
    setTimeout(tick, 150);
  }

  // Move every camera to a point of the timeline. Landing close to the end means "back to LIVE".
  function seekTimeline(v) {
    if (tl.mode === 'live') {
      var b = -v;
      goBehind(b <= Math.max(LIVE_TOL, tl.window * 0.015) ? 0 : b);
    } else if (tl.mode === 'vod') {
      var r = refTile();
      if (r) shiftAll(v - (get(r, 'getCurrentTime') || 0));
    }
  }

  function scrubValueAt(x) {
    var r = scrub.getBoundingClientRect(), f = r.width ? (x - r.left) / r.width : 1;
    return Math.round(range.min + Math.max(0, Math.min(1, f)) * (range.max - range.min));
  }

  function scrubTip(x, v) {
    var r = scrub.getBoundingClientRect();
    tip.textContent = scrubLabel(v);
    tip.classList.toggle('is-live', tl.mode === 'live' && -v <= LIVE_TOL);
    tip.hidden = false;
    var half = tip.offsetWidth / 2;
    tip.style.left = Math.max(half, Math.min(r.width - half, x - r.left)) + 'px';
    scrub.style.setProperty('--h', Math.max(0, Math.min(100, (x - r.left) / r.width * 100)) + '%');
  }

  var scrubbing = null;
  function scrubTo(x) {
    range.value = scrubValueAt(x);
    paintScrub();
    $('tlLeft').textContent = scrubLabel(range.value);
    $('tlLeft').className = 'tc' + (tl.mode === 'live' && -range.value <= LIVE_TOL ? ' is-live' : '');
    scrubTip(x, range.value);
  }
  function endScrub(commit) {
    if (!scrubbing) return;
    scrubbing = null;
    tl.dragging = false;
    scrub.classList.remove('is-drag');
    tip.hidden = true;
    if (commit) seekTimeline(range.value); else tick();
  }
  scrub.addEventListener('pointerdown', function (e) {
    if (range.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { scrub.setPointerCapture(e.pointerId); } catch (err) { /* old browsers: plain move events still work */ }
    scrubbing = { id: e.pointerId };
    tl.dragging = true;
    scrub.classList.add('is-drag');
    scrubTo(e.clientX);
  });
  scrub.addEventListener('pointermove', function (e) {
    if (scrubbing) { if (e.pointerId === scrubbing.id) scrubTo(e.clientX); }
    else if (e.pointerType === 'mouse' && !range.disabled) scrubTip(e.clientX, scrubValueAt(e.clientX));
  });
  scrub.addEventListener('pointerup', function (e) { if (scrubbing && e.pointerId === scrubbing.id) endScrub(true); });
  scrub.addEventListener('pointercancel', function (e) { if (scrubbing && e.pointerId === scrubbing.id) endScrub(false); });
  scrub.addEventListener('pointerleave', function () { if (!scrubbing) tip.hidden = true; });
  // arrows and End are handled for the whole page; on the timeline, Home jumps to the start and PgUp/PgDn by a minute
  scrub.addEventListener('keydown', function (e) {
    if (range.disabled) return;
    var k = e.key;
    if (k === 'Home') seekTimeline(range.min);
    else if (k === 'PageUp') seekBy(-60);
    else if (k === 'PageDown') seekBy(60);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  $('back30').addEventListener('click', function () { seekBy(-30); });
  $('back10').addEventListener('click', function () { seekBy(-10); });
  $('fwd10').addEventListener('click', function () { seekBy(10); });
  $('playAll').addEventListener('click', togglePlay);
  $('goLive').addEventListener('click', goLive);
  $('sound').addEventListener('click', function () {
    if (audio) setAudio(null);
    else { var v = visible(); setAudio(v.indexOf(state.focus) >= 0 ? state.focus : v[0]); }
  });

  // ================= layout =================

  function visible() {
    return state.layout === 'single' ? [state.focus] : state.order.filter(function (id) { return state.hidden.indexOf(id) < 0; });
  }

  function tileH(w) { return Math.round(w * 9 / 16) + BAR; }

  // largest 16:9 tile size that fits n tiles in W x H
  function fitGrid(n, W, H) {
    var best = { cols: 1, w: 0 };
    for (var cols = 1; cols <= n; cols++) {
      var rows = Math.ceil(n / cols);
      var w = Math.min((W - GAP * (cols - 1)) / cols, ((H - GAP * (rows - 1)) / rows - BAR) * 16 / 9);
      if (w > best.w + 0.5) best = { cols: cols, w: w };
    }
    return best;
  }

  function gridRects(list, x0, y0, W, H, out) {
    var n = list.length, f = fitGrid(n, W, H), cols = f.cols, w = Math.max(80, Math.floor(f.w)), h = tileH(w);
    var rows = Math.ceil(n / cols), total = rows * h + (rows - 1) * GAP;
    var oy = y0 + Math.max(0, (H - total) / 2);
    list.forEach(function (id, i) {
      var r = Math.floor(i / cols), c = i % cols;
      var inRow = Math.min(cols, n - r * cols), rowW = inRow * w + (inRow - 1) * GAP;
      out[id] = { x: x0 + (W - rowW) / 2 + c * (w + GAP), y: oy + r * (h + GAP), w: w, h: h };
    });
    return oy + total;
  }

  // flowing columns that scroll — for phones, where fitting everything on one screen makes tiles too small
  function flowRects(list, x0, y0, W, cols, out) {
    var w = Math.floor((W - GAP * (cols - 1)) / cols), h = tileH(w), y = y0;
    list.forEach(function (id, i) {
      y = y0 + Math.floor(i / cols) * (h + GAP);
      out[id] = { x: x0 + (i % cols) * (w + GAP), y: y, w: w, h: h };
    });
    return list.length ? y + h : y0;
  }

  function widthOf(id, W) {
    var f = has(state.sizes, id) ? state.sizes[id] : 1 / 3;
    return Math.max(Math.min(MIN_W, W), Math.min(W, Math.round(f * (W + GAP) - GAP)));
  }

  // Aranjează: each camera keeps its own width and is dropped, in order, into the highest spot it
  // fits (skyline packing), so small cameras tuck in beside and under big ones without overlapping.
  function packRects(list, W, out) {
    var sky = [{ x: 0, w: W + GAP, y: 0 }], bottom = 0;
    list.forEach(function (id) {
      var w = widthOf(id, W), ww = w + GAP, h = tileH(w), best = null, xs = [];
      sky.forEach(function (s) { xs.push(s.x, s.x + s.w - ww); });
      xs.forEach(function (x) {
        if (x < -0.5 || x + ww > W + GAP + 1.5) return;
        x = Math.max(0, x);
        var y = 0;
        sky.forEach(function (s) { if (s.x < x + ww - 0.5 && s.x + s.w > x + 0.5) y = Math.max(y, s.y); });
        if (!best || y < best.y - 0.5 || (Math.abs(y - best.y) <= 0.5 && x < best.x)) best = { x: x, y: y };
      });
      out[id] = { x: best.x, y: best.y, w: Math.min(w, W - best.x), h: h };
      var x0 = best.x, x1 = best.x + ww, next = [];
      sky.forEach(function (s) {
        var a = s.x, b = s.x + s.w;
        if (b <= x0 || a >= x1) { next.push(s); return; }
        if (a < x0) next.push({ x: a, w: x0 - a, y: s.y });
        if (b > x1) next.push({ x: x1, w: b - x1, y: s.y });
      });
      next.push({ x: x0, w: ww, y: best.y + h + GAP });
      next.sort(function (a, b) { return a.x - b.x; });
      sky = [];
      next.forEach(function (s) {
        var l = sky[sky.length - 1];
        if (l && Math.abs(l.y - s.y) < 0.5) l.w = s.x + s.w - l.x;
        else sky.push({ x: s.x, w: s.w, y: s.y });
      });
      bottom = Math.max(bottom, best.y + h);
    });
    return bottom;
  }

  // ---------- Liber: every camera stays where it is put ----------
  // A place is kept relative to the stage width, so it scales with the window: x as a share of W + GAP,
  // y as a share of it (y) plus pixels (b) for the title bars and gaps of the cameras stacked above.
  // Cameras placed under or beside each other still touch after a resize or in full screen.
  var HB = BAR - GAP * 9 / 16;   // a camera f wide is f * 9/16 of W + GAP tall, plus this
  var SNAP = 10;                 // px within which a moving edge lines up with another
  var moving = null;             // the camera being dragged in Liber: { id, x, y, a, b }
  var pinned = null;             // the camera being dragged or resized: the others make way for it
  var shown = {};                // what the stage shows now, per camera

  function placeOf(id, W) {
    var U = W + GAP, w = widthOf(id, W), p = state.pos[id];
    return { id: id, x: Math.max(0, Math.min(W - w, p.x * U)), y: Math.max(0, p.y * U + p.b), w: w, h: tileH(w), f: (w + GAP) / U, a: p.y, b: p.b };
  }

  function overlap(r, o) { return r.x < o.x + o.w - 1 && o.x < r.x + r.w - 1 && r.y < o.y + o.h - 1 && o.y < r.y + r.h - 1; }

  // Nothing covers anything: `fixed` stays put and any camera it lands on moves straight down, just
  // below what it would cover, working from the top of the stage down.
  function settle(rs, fixed) {
    var done = fixed ? [fixed] : [];
    rs.filter(function (r) { return r !== fixed; })
      .sort(function (p, q) { return p.y - q.y || p.x - q.x; })
      .forEach(function (r) {
        for (var moved = true; moved;) {
          moved = false;
          done.forEach(function (o) {
            if (!overlap(r, o)) return;
            r.y = o.y + o.h + GAP; r.a = o.a + o.f * 9 / 16; r.b = o.b + HB + GAP;
            moved = true;
          });
        }
        done.push(r);
      });
  }

  // where a camera r could line up: v is its top (or left) edge, g where to draw the guide
  function yLines(r, others) {
    var out = [{ v: 0, a: 0, b: 0, g: null }];
    others.forEach(function (o) {
      out.push({ v: o.y, a: o.a, b: o.b, g: o.y },
        { v: o.y + o.h + GAP, a: o.a + o.f * 9 / 16, b: o.b + HB + GAP, g: o.y + o.h + GAP / 2 },
        { v: o.y - GAP - r.h, a: o.a - r.f * 9 / 16, b: o.b - HB - GAP, g: o.y - GAP / 2 },
        { v: o.y + o.h - r.h, a: o.a + (o.f - r.f) * 9 / 16, b: o.b, g: o.y + o.h });
    });
    return out.filter(function (c) { return c.v >= -0.5; });
  }
  function xLines(r, others, W) {
    var out = [{ v: 0, g: null }, { v: W - r.w, g: null }];
    others.forEach(function (o) {
      out.push({ v: o.x, g: o.x }, { v: o.x + o.w + GAP, g: o.x + o.w + GAP / 2 },
        { v: o.x - GAP - r.w, g: o.x - GAP / 2 }, { v: o.x + o.w - r.w, g: o.x + o.w });
    });
    return out.filter(function (c) { return c.v >= -0.5 && c.v <= W - r.w + 0.5; });
  }
  // the closest line within reach; one listed earlier (the stage's edges first) wins unless another is a pixel closer
  function nearest(list, v, within) {
    var best = null, d0 = within;
    list.forEach(function (c) { var d = Math.abs(c.v - v); if (d <= d0) { best = c; d0 = d - 1; } });
    return best;
  }

  // store pixel rects as places, recognising cameras that sit level with or right under another
  function setPlaces(list, rects, W) {
    var U = W + GAP, done = [];
    list.slice().sort(function (p, q) { return rects[p].y - rects[q].y || rects[p].x - rects[q].x; }).forEach(function (id) {
      var r = rects[id], m = nearest(yLines({ h: tileH(r.w), f: (r.w + GAP) / U }, done), r.y, 1.5);
      state.sizes[id] = Math.min(1, (r.w + GAP) / U);
      state.pos[id] = { x: Math.max(0, r.x / U), y: m ? m.a : r.y / U, b: m ? m.b : 0 };
      done.push(placeOf(id, W));
    });
  }

  // cameras without a place yet: if none has one, they are packed by their sizes; otherwise each
  // goes to the highest free spot
  function ensurePos(vis, W) {
    var missing = vis.filter(function (id) { return !has(state.pos, id); });
    if (!missing.length) return;
    if (missing.length === vis.length) {
      var rects = {};
      packRects(vis, W, rects);
      setPlaces(vis, rects, W);
      return;
    }
    var U = W + GAP, placed = vis.filter(function (id) { return has(state.pos, id); }).map(function (id) { return placeOf(id, W); });
    missing.forEach(function (id) {
      var w = widthOf(id, W), h = tileH(w), xs = [0], ys = [0], best = null;
      placed.forEach(function (o) { xs.push(o.x + o.w + GAP); ys.push(o.y + o.h + GAP); });
      ys.forEach(function (y) {
        xs.forEach(function (x) {
          var c = { x: x, y: y, w: w, h: h };
          if (x + w > W + 0.5 || placed.some(function (o) { return overlap(c, o); })) return;
          if (!best || y < best.y - 0.5 || (Math.abs(y - best.y) <= 0.5 && x < best.x)) best = c;
        });
      });
      var m = nearest(yLines({ h: h, f: (w + GAP) / U }, placed), best.y, 1.5);
      state.pos[id] = { x: best.x / U, y: m ? m.a : best.y / U, b: m ? m.b : 0 };
      placed.push(placeOf(id, W));
    });
  }

  function freeLayout(vis, W, out) {
    ensurePos(vis, W);
    var rs = vis.map(function (id) { return placeOf(id, W); }), pin = null, bottom = 0;
    rs.forEach(function (r) {
      if (moving && r.id === moving.id) { r.x = moving.x; r.y = moving.y; r.a = moving.a; r.b = moving.b; }
      if (r.id === pinned) pin = r;
    });
    settle(rs, pin);
    rs.forEach(function (r) { out[r.id] = r; bottom = Math.max(bottom, r.y + r.h); });
    return bottom;
  }

  // start Liber from whatever is on screen now, so the first move or resize changes only that camera
  function seedFree() {
    if (state.layout === 'focus') {
      state.order = [state.focus].concat(state.order.filter(function (id) { return id !== state.focus; }));
    }
    setPlaces(visible().filter(function (id) { return shown[id]; }), shown, stage.clientWidth);
    state.layout = 'free';
  }

  // Aranjează: pack the cameras again, in the order they are read on screen, each keeping its size
  function tidy() {
    if (state.layout !== 'free') return;
    var W = stage.clientWidth, rects = {};
    var list = visible().sort(function (p, q) { var a = shown[p], b = shown[q]; return a && b ? a.y - b.y || a.x - b.x : 0; });
    packRects(list, W, rects);
    setPlaces(list, rects, W);
    render();
  }

  // keep what the stage shows now: the moved camera's new place and those that made way for it
  function commitFree() {
    var U = stage.clientWidth + GAP;
    visible().forEach(function (id) {
      var r = shown[id], p = state.pos[id];
      if (r && p) state.pos[id] = { x: moving && moving.id === id ? r.x / U : p.x, y: r.a, b: r.b };
    });
    moving = null; pinned = null;
    guide(null, null);
    render();
  }

  var guideV = document.createElement('i'), guideH = document.createElement('i');
  guideV.className = 'guide v'; guideH.className = 'guide h';
  guideV.hidden = guideH.hidden = true;
  stage.appendChild(guideV); stage.appendChild(guideH);
  function guide(x, y) {
    guideV.hidden = x == null; guideH.hidden = y == null;
    if (x != null) guideV.style.transform = 'translateX(' + Math.round(x) + 'px)';
    if (y != null) guideH.style.transform = 'translateY(' + Math.round(y) + 'px)';
  }

  function compute(vis, W, H) {
    var rects = {}, bottom;
    if (state.layout === 'free') {
      bottom = freeLayout(vis, W, rects);
    } else if (state.layout === 'focus' && vis.length > 1) {
      var others = vis.filter(function (id) { return id !== state.focus; });
      if (W >= 760) {
        // thumbnails fitted into a side column; the big camera gets every pixel they don't use
        var side = Math.round(Math.min(Math.max(W * 0.26, 220), 440));
        var used = function (sw) { var f = fitGrid(others.length, sw, H), w = Math.max(80, Math.floor(f.w)); return f.cols * w + (f.cols - 1) * GAP; };
        var mw = Math.floor(Math.min(W - used(side) - GAP, (H - BAR) * 16 / 9));
        var sw = used(W - mw - GAP);
        var x0 = Math.max(0, (W - mw - GAP - sw) / 2), mh = tileH(mw);
        rects[state.focus] = { x: x0, y: Math.max(0, (H - mh) / 2), w: mw, h: mh };
        bottom = Math.max(mh, gridRects(others, x0 + mw + GAP, 0, sw, H, rects));
      } else {
        rects[state.focus] = { x: 0, y: 0, w: W, h: tileH(W) };
        bottom = flowRects(others, 0, tileH(W) + GAP, W, 2, rects);
      }
    } else {
      bottom = gridRects(vis, 0, 0, W, H, rects);
    }
    return { rects: rects, height: Math.max(H, Math.ceil(bottom)) };
  }

  function relayout() {
    if ($('dock').hidden) return;
    var dockH = $('dock').offsetHeight;
    document.documentElement.style.setProperty('--dock-h', dockH + 'px');
    stage.style.marginBottom = (dockH + 6) + 'px';
    var vis = visible();
    var W = stage.clientWidth;
    var H = Math.max(220, window.innerHeight - $('hdr').offsetHeight - dockH - 12);
    var res = compute(vis, W, H);
    shown = res.rects;
    stage.style.height = res.height + 'px';
    vis.forEach(function (id) {
      var r = res.rects[id], el = tiles[id].el;
      if (!r) return;
      el.style.transform = 'translate(' + Math.round(r.x) + 'px,' + Math.round(r.y) + 'px)';
      el.style.width = Math.round(r.w) + 'px';
      el.style.height = Math.round(r.h) + 'px';
      el.classList.toggle('compact', r.w < 240);
    });
  }

  function render() {
    var vis = visible();
    if (state.layout !== 'single' && vis.indexOf(state.focus) < 0) state.focus = vis[0];
    ids.forEach(function (id) {
      var t = tiles[id], on = vis.indexOf(id) >= 0;
      if (on && t.el.hidden) {
        // appear in place instead of sliding in from wherever it was last
        t.el.classList.add('instant');
        requestAnimationFrame(function () { requestAnimationFrame(function () { t.el.classList.remove('instant'); }); });
      }
      t.el.hidden = !on;
      if (on) mount(t); else unmount(t);
    });
    stage.dataset.layout = state.layout;
    relayout();
    paint();
    save();
  }

  function paint() {
    var vis = visible();
    document.querySelectorAll('.seg button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.layout === state.layout));
    });
    $('tidy').hidden = state.layout !== 'free' || vis.length < 2;
    var chips = $('chips');
    var focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.chip');
    var refocus = focused ? focused.dataset.id : null;
    chips.textContent = '';
    cams.forEach(function (c) {
      var b = document.createElement('button');
      var on = state.layout === 'single' ? c.id === state.focus : state.hidden.indexOf(c.id) < 0;
      b.type = 'button'; b.className = 'chip'; b.dataset.id = c.id;
      b.setAttribute('aria-pressed', String(on));
      b.title = state.layout === 'single' ? 'Arată ' + c.label : (on ? 'Ascunde ' : 'Arată ') + c.label;
      b.innerHTML = '<span class="n">' + pad2(c.n) + '</span>';
      b.appendChild(document.createTextNode(c.label));
      if (audio === c.id) b.insertAdjacentHTML('beforeend', ICON.sound);
      chips.appendChild(b);
      if (c.id === refocus) b.focus();
    });
    ids.forEach(function (id) {
      var t = tiles[id], el = t.el, on = audio === id;
      el.classList.toggle('is-audio', on);
      el.querySelector('.aud').hidden = !on;
      var a = el.querySelector('[data-act="audio"]');
      a.innerHTML = on ? ICON.sound : ICON.muted;
      a.setAttribute('aria-pressed', String(on));
      a.title = on ? 'Oprește sunetul' : 'Ascultă camera asta';
      a.setAttribute('aria-label', a.title + ': ' + t.cam.label);
      el.querySelector('[data-act="focus"]').hidden = state.layout === 'single' || (state.layout === 'focus' && id === state.focus) || vis.length < 2;
      el.querySelector('[data-act="hide"]').hidden = state.layout === 'single' || vis.length < 2;
    });
    var s = $('sound');
    s.classList.toggle('on', !!audio);
    s.innerHTML = (audio ? ICON.sound : ICON.muted) + '<span></span>';
    s.querySelector('span').textContent = audio ? tiles[audio].cam.label : 'Fără sunet';
    s.title = audio ? 'Oprește sunetul (M)' : 'Pornește sunetul camerei mari (M)';
    s.setAttribute('aria-label', audio ? 'Sunet de la ' + tiles[audio].cam.label + '. Apasă pentru liniște.' : 'Fără sunet. Apasă ca să pornești sunetul.');
  }

  // ================= actions =================

  function focusOn(id) {
    state.hidden = state.hidden.filter(function (x) { return x !== id; });
    state.focus = id;
    if (state.layout !== 'single') state.layout = 'focus';
    render();
  }

  function hide(id) {
    if (visible().length < 2) return;
    state.hidden.push(id);
    render();
  }

  // drop a onto b: they trade places; in Focus that includes trading the big spot
  function swap(a, b) {
    var o = state.order, i = o.indexOf(a), j = o.indexOf(b);
    o[i] = b; o[j] = a;
    if (state.focus === a) state.focus = b;
    else if (state.focus === b) state.focus = a;
    render();
  }

  document.querySelector('.seg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    // Liber comes back as it was left; the first time, it starts from what is on screen
    if (b.dataset.layout === 'free' && state.layout !== 'free' &&
        !visible().every(function (id) { return has(state.pos, id) || has(state.sizes, id); })) seedFree();
    state.layout = b.dataset.layout;
    render();
  });

  $('tidy').addEventListener('click', tidy);

  $('chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    var id = b.dataset.id;
    if (state.layout === 'single') { state.focus = id; render(); return; }
    var k = state.hidden.indexOf(id);
    if (k >= 0) { state.hidden.splice(k, 1); render(); }
    else if (visible().length > 1) hide(id);
    else toast('Măcar o cameră rămâne pe ecran.');
  });

  stage.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var id = b.closest('.tile').dataset.id;
    if (b.dataset.act === 'audio') setAudio(audio === id ? null : id);
    else if (b.dataset.act === 'focus') focusOn(id);
    else if (b.dataset.act === 'hide') hide(id);
  });

  stage.addEventListener('dblclick', function (e) {
    var bar = e.target.closest('.th');
    if (!bar || e.target.closest('button')) return;
    var id = bar.parentNode.dataset.id;
    if (state.layout === 'focus' && state.focus === id) { state.layout = 'grid'; render(); }
    else focusOn(id);
  });

  // ---------- drag a camera's corner to resize it ----------

  var SNAPS = [[1, '1/1'], [3 / 4, '3/4'], [2 / 3, '2/3'], [1 / 2, '1/2'], [1 / 3, '1/3'], [1 / 4, '1/4']];
  var rz = null, rzRaf = 0;
  stage.addEventListener('pointerdown', function (e) {
    var grip = e.target.closest('.grip');
    if (!grip || e.button !== 0 || state.layout === 'single') return;
    e.preventDefault();
    if (state.layout !== 'free') { seedFree(); render(); }
    var el = grip.parentNode, id = el.dataset.id, r = shown[id];
    if (!r) return;
    // the top-left corner stays put; whatever the camera grows over makes way
    rz = { id: id, el: el, x: r.x, y: r.y, w0: r.w, base: shown, sx: e.clientX, sy: e.clientY, tag: document.createElement('span') };
    pinned = id;
    rz.tag.className = 'size-tag';
    el.appendChild(rz.tag);
    el.classList.add('resizing');
    document.body.classList.add('is-resizing');
    grip.setPointerCapture(e.pointerId);
  });

  function resizeMove(e) {
    var W = stage.clientWidth, U = W + GAP, dx = e.clientX - rz.sx, dy = (e.clientY - rz.sy) * 16 / 9;
    var max = W - rz.x, min = Math.min(MIN_W, max);
    // follow whichever direction the pointer moved more, so diagonal drags feel natural
    var w = Math.max(min, Math.min(max, rz.w0 + (Math.abs(dx) >= Math.abs(dy) ? dx : dy)));
    // widths worth snapping to: full, 3/4, 2/3, 1/2, 1/3, 1/4 of the stage, its right edge, and the
    // widths that line the right or bottom edge up with another camera
    var lines = SNAPS.map(function (s) { return { v: s[0] * U - GAP, label: s[1] }; });
    lines.push({ v: max });
    visible().forEach(function (id) {
      var o = rz.base[id];
      if (id === rz.id || !o) return;
      lines.push({ v: o.x - GAP - rz.x, gx: o.x - GAP / 2 }, { v: o.x + o.w - rz.x, gx: o.x + o.w },
        { v: (o.y - GAP - rz.y - BAR) * 16 / 9, gy: o.y - GAP / 2 }, { v: (o.y + o.h - rz.y - BAR) * 16 / 9, gy: o.y + o.h });
    });
    var s = nearest(lines.filter(function (c) { return c.v >= min - 0.5 && c.v <= max + 0.5; }), w, 12);
    if (s) w = s.v;
    state.sizes[rz.id] = (w + GAP) / U;
    rz.tag.textContent = (s && s.label) || Math.round((w + GAP) / U * 100) + '%';
    guide(s && s.gx, s && s.gy);
    cancelAnimationFrame(rzRaf);
    rzRaf = requestAnimationFrame(relayout);
  }

  function endResize() {
    if (!rz) return;
    rz.tag.remove();
    rz.el.classList.remove('resizing');
    document.body.classList.remove('is-resizing');
    rz = null;
    cancelAnimationFrame(rzRaf);
    relayout();
    commitFree();
  }
  stage.addEventListener('pointerup', endResize);
  stage.addEventListener('pointercancel', endResize);

  // ---------- drag a camera by its bar: in Liber anywhere, elsewhere onto another to swap them ----------

  var drag = null, dragRaf = 0;
  stage.addEventListener('pointerdown', function (e) {
    var bar = e.target.closest('.th');
    if (!bar || e.target.closest('button') || e.button !== 0) return;
    var free = state.layout === 'free', el = bar.parentNode, id = el.dataset.id, r = shown[id];
    if (!r || (!free && visible().length < 2)) return;
    drag = { el: el, id: id, x0: r.x, y0: r.y, sx: e.pageX, sy: e.pageY, on: false, target: null, free: free, base: shown };
    bar.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', function (e) {
    if (rz) { resizeMove(e); return; }
    if (!drag) return;
    var dx = e.pageX - drag.sx, dy = e.pageY - drag.sy;
    if (!drag.on) {
      if (Math.abs(dx) + Math.abs(dy) < 8) return;
      drag.on = true;
      drag.el.classList.add('dragging');
      document.body.classList.add('is-dragging');
      if (drag.free) pinned = drag.id;
    }
    if (drag.free) { moveFree(drag.x0 + dx, drag.y0 + dy); return; }
    drag.el.style.transform = 'translate(' + (drag.x0 + dx) + 'px,' + (drag.y0 + dy) + 'px)';
    var over = null;
    visible().forEach(function (id) {
      if (id === drag.id) return;
      var r = tiles[id].el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) over = id;
    });
    if (over !== drag.target) {
      if (drag.target) tiles[drag.target].el.classList.remove('drop-target');
      if (over) tiles[over].el.classList.add('drop-target');
      drag.target = over;
    }
  });

  // Liber: the camera follows the pointer, lines up with edges close by, and those it lands on make way
  function moveFree(x, y) {
    var W = stage.clientWidth, U = W + GAP, me = drag.base[drag.id], r = { w: me.w, h: me.h, f: me.f };
    var others = visible().filter(function (id) { return id !== drag.id && drag.base[id]; }).map(function (id) { return drag.base[id]; });
    x = Math.max(0, Math.min(W - r.w, x));
    y = Math.max(0, y);
    var sx = nearest(xLines(r, others, W), x, SNAP), sy = nearest(yLines(r, others), y, SNAP);
    moving = { id: drag.id, x: sx ? sx.v : x, y: sy ? sy.v : y, a: sy ? sy.a : y / U, b: sy ? sy.b : 0 };
    guide(sx && sx.g, sy && sy.g);
    cancelAnimationFrame(dragRaf);
    dragRaf = requestAnimationFrame(relayout);
  }

  function endDrag() {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.on) return;
    d.el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    if (d.free) { cancelAnimationFrame(dragRaf); relayout(); commitFree(); return; }
    if (d.target) { tiles[d.target].el.classList.remove('drop-target'); swap(d.id, d.target); }
    else relayout();
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // ---------- share ----------

  var dlg = $('shareDlg'), shareLink = location.origin + eventUrl(title, cams), qrSvg = '';

  function loadQr(cb) {
    if (window.qrcode) return cb();
    var s = document.createElement('script');
    s.src = 'qrcode.js';
    s.onload = cb;
    s.onerror = function () { $('qrWrap').hidden = true; $('dlQr').hidden = true; };
    document.head.appendChild(s);
  }

  $('share').addEventListener('click', function () {
    $('shareUrl').value = shareLink;
    $('nativeShare').hidden = !navigator.share;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    loadQr(function () {
      if (qrSvg) return;
      try {
        var qr = qrcode(0, 'M');
        qr.addData(shareLink);
        qr.make();
        qrSvg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
        $('qr').innerHTML = qrSvg;
      } catch (e) {
        // too long for a QR code: the link can still be copied and sent
        $('qrWrap').hidden = true; $('dlQr').hidden = true;
      }
    });
  });
  $('shareClose').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  $('copyUrl').addEventListener('click', function () {
    var b = this, done = function () { b.textContent = 'Copiat ✓'; setTimeout(function () { b.textContent = 'Copiază'; }, 1800); };
    var input = $('shareUrl');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareLink).then(done, function () { input.select(); document.execCommand('copy'); done(); });
    } else { input.select(); document.execCommand('copy'); done(); }
  });

  $('nativeShare').addEventListener('click', function () {
    navigator.share({ title: (title ? title + ' · ' : '') + 'ERA Live', url: shareLink }).catch(function () {});
  });

  // a printable card (logo, QR, event name) on white: it prints and forwards better than the bare code
  var SYS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  function loadImg(src, cb) {
    var im = new Image();
    im.onload = function () { cb(im); };
    im.onerror = function () { cb(null); };
    im.src = src;
  }
  $('dlQr').addEventListener('click', function () {
    if (!qrSvg) return;
    var W = 1200, H = 1480, Q = 860;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    var qrUrl = URL.createObjectURL(new Blob([qrSvg], { type: 'image/svg+xml' }));
    loadImg('logo/era-live-logo-light.svg', function (logo) {
      loadImg(qrUrl, function (qr) {
        URL.revokeObjectURL(qrUrl);
        if (!qr) return;
        if (logo) { var lh = 64, lw = logo.width / logo.height * lh; x.drawImage(logo, (W - lw) / 2, 110, lw, lh); }
        x.imageSmoothingEnabled = false;
        x.drawImage(qr, (W - Q) / 2, 250, Q, Q);
        x.textAlign = 'center';
        x.fillStyle = '#111112';
        x.font = '600 50px ' + SYS;
        x.fillText(title || 'Transmisiune live', W / 2, 1230, W - 160);
        x.fillStyle = '#6e6e73';
        x.font = '400 32px ' + SYS;
        x.fillText('Scanează codul ca să vezi toate camerele.', W / 2, 1294, W - 160);
        c.toBlob(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'era-live-qr.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        });
      });
    });
  });

  // ---------- YouTube consent and the legal links ----------

  var gateLinks = $('gateLinks');
  cams.forEach(function (c) {
    var li = document.createElement('li'), a = document.createElement('a'), n = document.createElement('span');
    a.href = 'https://www.youtube.com/watch?v=' + c.id;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    n.textContent = pad2(c.n);
    a.appendChild(n);
    a.appendChild(document.createTextNode(c.label));
    li.appendChild(a);
    gateLinks.appendChild(li);
  });
  function accept() {
    store(CONSENT_KEY, { v: CONSENT_V, yt: true, ts: Date.now() });
    consented = true;
    $('gate').hidden = true;
    $('dock').hidden = false;
    $('status').hidden = false;
    loadAPI();
    render();
    tick();
    hintOnce();
  }
  function refuse() {
    store(CONSENT_KEY, { v: CONSENT_V, yt: false, ts: Date.now() });
    // players that are already running can't be unloaded cleanly: start over without YouTube
    if (consented) { location.reload(); return; }
    paintGate();
    $('gateTitle').focus({ preventScroll: true });
  }
  // first question, or, once refused, the direct links and a way to change one's mind
  function paintGate() {
    var c = consentChoice(), refused = !!(c && !c.yt);
    $('gateAsk').hidden = refused;
    $('gateRefused').hidden = !refused;
  }
  $('gateOk').addEventListener('click', accept);
  $('gateNo').addEventListener('click', refuse);
  $('gateRetry').addEventListener('click', accept);

  // the same choice, any time, from the ⓘ button
  var infoDlg = $('infoDlg');
  function paintChoice() {
    var c = consentChoice();
    $('csLine').textContent = c
      ? (c.yt ? 'Acceptate' : 'Refuzate') + ' în acest browser pe ' + new Date(c.ts).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) + '.'
      : 'Nu ai ales încă.';
    $('csOk').setAttribute('aria-pressed', String(!!(c && c.yt)));
    $('csNo').setAttribute('aria-pressed', String(!!(c && !c.yt)));
  }
  $('info').addEventListener('click', function () {
    paintChoice();
    if (typeof infoDlg.showModal === 'function') infoDlg.showModal(); else infoDlg.setAttribute('open', '');
  });
  $('infoClose').addEventListener('click', function () { infoDlg.close(); });
  infoDlg.addEventListener('click', function (e) { if (e.target === infoDlg) infoDlg.close(); });
  $('csOk').addEventListener('click', function () { infoDlg.close(); if (!consented) accept(); });
  $('csNo').addEventListener('click', function () {
    var c = consentChoice();
    infoDlg.close();
    if (!c || c.yt) refuse();
  });

  // ---------- edit, fullscreen, keyboard ----------

  function showViewer() {
    $('setup').hidden = true;
    ['hdr', 'stage'].forEach(function (id) { $(id).hidden = false; });
    $('dock').hidden = !consented;
    $('status').hidden = !consented;
    $('gate').hidden = consented;
    if (!consented) paintGate();
    document.title = (title ? title + ' · ' : '') + 'ERA Live';
    relayout();
  }
  onLeaveSetup = showViewer;
  $('edit').addEventListener('click', function () { setAudio(null); showSetup(true); });

  var fs = $('fullscreen');
  if (!document.fullscreenEnabled) fs.hidden = true;
  fs.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  });
  document.addEventListener('fullscreenchange', function () {
    fs.innerHTML = document.fullscreenElement ? ICON.fsOff : ICON.fsOn;
    onResize();
  });

  document.addEventListener('keydown', function (e) {
    if (!$('setup').hidden || !consented || dlg.open || infoDlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
    var el = e.target;
    if (el.closest && el.closest('input, textarea, select') && el.type !== 'range') return;
    var k = e.key, n = parseInt(k, 10), lk = k.toLowerCase();
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seekBy(e.shiftKey ? -30 : -10); }
    else if (k === 'ArrowRight') { e.preventDefault(); seekBy(e.shiftKey ? 30 : 10); }
    else if (k === 'End') { e.preventDefault(); goLive(); }
    else if (n >= 1 && n <= cams.length) {
      var id = cams[n - 1].id;
      if (state.layout === 'single') { state.focus = id; render(); } else focusOn(id);
    }
    else if ({ g: 'grid', f: 'focus', u: 'single', l: 'free' }[lk]) {
      document.querySelector('.seg [data-layout="' + { g: 'grid', f: 'focus', u: 'single', l: 'free' }[lk] + '"]').click();
    }
    else if (lk === 'm') $('sound').click();
    else if (lk === 'a') tidy();
  });

  var raf = 0;
  function onResize() { cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout); }
  window.addEventListener('resize', onResize);

  // ================= start =================

  $('evTitle').textContent = title || 'Transmisiune live';
  $('evMeta').textContent = cams.length === 1 ? '1 cameră' : cams.length + ' camere';
  showViewer();
  // the cookie question is the first thing on the page: put screen readers on it
  if (!consented) $('gateTitle').focus({ preventScroll: true });
  stage.classList.add('instant');
  render();
  tick();
  requestAnimationFrame(function () { requestAnimationFrame(function () { stage.classList.remove('instant'); }); });
  function hintOnce() {
    if (cams.length < 2 || load(HINT_KEY)) return;
    setTimeout(function () { toast('Trage de bara unei camere ca s-o muți și de colțul ei ca s-o mărești.', 5200); }, 1400);
    store(HINT_KEY, { ts: Date.now() });
  }
  if (consented) hintOnce();
})();
