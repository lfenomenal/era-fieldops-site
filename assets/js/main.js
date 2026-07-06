/* ERA FieldOPS — interactions & animations */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;

  /* ---------- Hero entrance on load ---------- */
  window.addEventListener('load', function () {
    requestAnimationFrame(function () { document.body.classList.add('loaded'); });
  });
  setTimeout(function () { document.body.classList.add('loaded'); }, 1200);

  /* ---------- Nav: blur on scroll + scroll progress bar ---------- */
  var nav = document.getElementById('nav');
  var progressBar = document.getElementById('scrollProgress');
  var lastScrolled = false;
  function onScroll() {
    var scrolled = window.scrollY > 24;
    if (scrolled !== lastScrolled) {
      nav.classList.toggle('scrolled', scrolled);
      lastScrolled = scrolled;
    }
    if (progressBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      progressBar.style.width = pct.toFixed(2) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Nav: scrollspy active link ---------- */
  var navLinks = Array.from(document.querySelectorAll('.nav-links a'));
  if (navLinks.length) {
    var spySections = navLinks
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);
    var spyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var link = navLinks.find(function (a) { return a.getAttribute('href') === '#' + entry.target.id; });
        if (!link) return;
        navLinks.forEach(function (a) { a.classList.remove('active'); });
        link.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    spySections.forEach(function (s) { spyObs.observe(s); });
  }

  /* ---------- Mobile menu ---------- */
  var burger = document.getElementById('burger');
  var mobileMenu = document.getElementById('mobileMenu');
  burger.addEventListener('click', function () {
    var open = mobileMenu.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  mobileMenu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      mobileMenu.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- Seamless marquees (duplicate content) ---------- */
  var track = document.getElementById('logoTrack');
  if (track) track.innerHTML += track.innerHTML;
  var featureTrack = document.getElementById('featureTrack');
  if (featureTrack) featureTrack.innerHTML += featureTrack.innerHTML;

  /* ---------- Reveal on scroll ---------- */
  var revealObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { revealObs.observe(el); });

  /* mark feature visuals for bar/chart animations */
  var vizObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        vizObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.mock').forEach(function (el) { vizObs.observe(el); });

  /* ---------- Counters ---------- */
  function animateCounter(el) {
    var target = parseFloat(el.dataset.target);
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    if (reduceMotion) { el.textContent = target.toFixed(decimals); return; }
    var dur = 1800, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counterObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.counter').forEach(function (el) { counterObs.observe(el); });

  /* ---------- Workflow activation ---------- */
  var workflow = document.getElementById('workflow');
  if (workflow) {
    var steps = workflow.querySelectorAll('.wf-step');
    var progress = document.getElementById('wfProgress');
    var wfObs = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      wfObs.disconnect();
      if (progress) progress.style.width = '92%';
      steps.forEach(function (s, i) {
        setTimeout(function () { s.classList.add('active'); }, reduceMotion ? 0 : i * 180);
      });
    }, { threshold: 0.3 });
    wfObs.observe(workflow);
  }

  /* ---------- Cursor-follow spotlight + subtle tilt on cards ---------- */
  if (!reduceMotion && fine) {
    function addSpotlightTilt(selector, tilt) {
      document.querySelectorAll(selector).forEach(function (el) {
        el.addEventListener('mousemove', function (e) {
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width;
          var py = (e.clientY - r.top) / r.height;
          el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
          el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
          if (tilt) {
            var rx = (py - 0.5) * -tilt;
            var ry = (px - 0.5) * tilt;
            el.style.transform = 'translateY(-5px) scale(1.015) perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
          }
        }, { passive: true });
        el.addEventListener('mouseleave', function () {
          el.style.removeProperty('--mx');
          el.style.removeProperty('--my');
          if (tilt) el.style.transform = '';
        });
      });
    }
    addSpotlightTilt('.card', 5);
    addSpotlightTilt('.stat-card', 3.5);
    addSpotlightTilt('.mock', 0);
  }

  /* ---------- Magnetic pull on primary buttons (on-hover) ---------- */
  if (!reduceMotion && fine) {
    document.querySelectorAll('.btn-primary:not(.btn-magnetic)').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) * 0.22;
        var dy = (e.clientY - r.top - r.height / 2) * 0.35;
        btn.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) translateY(-2px) scale(1.02)';
      }, { passive: true });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ---------- Proximity magnetic button (follows the cursor nearby, eases back) ---------- */
  (function () {
    if (reduceMotion || !fine) return; // pointer-follow is a mouse/trackpad feature
    var els = Array.from(document.querySelectorAll('.btn-magnetic'));
    if (!els.length) return;
    var RADIUS = 130;    // proximity zone around the button (px)
    var STRENGTH = 0.55; // how strongly it leans toward the cursor
    var MAXOFF = 32;     // clamp so the travel stays restrained but clearly visible
    var EASE = 0.2;      // lower = slower / lazier follow
    var states = els.map(function (btn) { return { btn: btn, tx: 0, ty: 0, x: 0, y: 0, active: false }; });
    var raf = null;

    document.addEventListener('pointermove', function (e) {
      for (var i = 0; i < states.length; i++) {
        var s = states[i], r = s.btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        if (Math.abs(dx) < r.width / 2 + RADIUS && Math.abs(dy) < r.height / 2 + RADIUS) {
          s.active = true;
          s.tx = Math.max(-MAXOFF, Math.min(MAXOFF, dx * STRENGTH));
          s.ty = Math.max(-MAXOFF, Math.min(MAXOFF, dy * STRENGTH));
        } else {
          s.active = false; s.tx = 0; s.ty = 0;
        }
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    function loop() {
      raf = null;
      var moving = false;
      for (var i = 0; i < states.length; i++) {
        var s = states[i];
        s.x += (s.tx - s.x) * EASE;
        s.y += (s.ty - s.y) * EASE;
        if (Math.abs(s.x - s.tx) > 0.1 || Math.abs(s.y - s.ty) > 0.1) moving = true;
        var scale = s.active ? 1.05 : 1;
        if (!s.active && Math.abs(s.x) < 0.1 && Math.abs(s.y) < 0.1) {
          s.btn.style.transform = '';
        } else {
          s.btn.style.transform = 'translate(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px) scale(' + scale + ')';
        }
      }
      if (moving) raf = requestAnimationFrame(loop);
    }
  })();

  /* ---------- Auto-stagger reveal for grid children ---------- */
  document.querySelectorAll('.bento, .grid-3, .sec-grid, .stats-grid').forEach(function (grid) {
    Array.from(grid.children).forEach(function (el, i) {
      if (el.classList.contains('reveal')) el.style.transitionDelay = (i * 70) + 'ms';
    });
  });

  /* ---------- Tab groups (AI / Integrări / Platformă în detaliu) ---------- */
  document.querySelectorAll('.tab-group').forEach(function (group) {
    var buttons = Array.from(group.querySelectorAll('.tab-btn'));
    var panels = Array.from(group.querySelectorAll('.tab-panel'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('active')) return;
        var target = btn.dataset.tab;
        buttons.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
        });
        panels.forEach(function (p) {
          var on = p.dataset.panel === target;
          p.classList.toggle('active', on);
          if (on) p.querySelectorAll('.mock').forEach(function (m) { m.classList.add('in-view'); });
        });
        btn.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
      });
    });
  });

  /* ---------- Price toggle (pe zi / pe lună) ---------- */
  (function () {
    var toggle = document.querySelector('.ph-toggle');
    if (!toggle) return;
    var tabs = Array.from(toggle.querySelectorAll('.ph-tab'));
    var nums = ['phCoffee', 'phEra'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var priceBox = document.getElementById('phPrice');

    function tween(el, to) {
      var from = parseFloat(el.textContent.replace(/[^\d.]/g, '')) || 0;
      if (reduceMotion) { el.textContent = to + ' lei'; return; }
      var dur = 500, start = null;
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (to - from) * eased) + ' lei';
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    function setPeriod(period) {
      tabs.forEach(function (t) {
        var on = t.dataset.period === period;
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', String(on));
      });
      if (priceBox) priceBox.classList.toggle('month', period === 'month');
      nums.forEach(function (el) { tween(el, parseFloat(el.dataset[period])); });
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        if (!t.classList.contains('active')) setPeriod(t.dataset.period);
      });
    });
  })();

  /* ---------- Background particles ---------- */
  var canvas = document.getElementById('particles');
  if (canvas && window.innerWidth >= 760) {
    var ctx = canvas.getContext('2d');
    var particles = [];
    var W, H, running = true;

    function seed() {
      particles.length = 0;
      var COUNT = Math.min(60, Math.max(24, Math.floor(W / 24)));
      for (var i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.4 + 0.4,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          a: Math.random() * 0.35 + 0.08
        });
      }
    }
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      if (W > 0 && particles.length === 0) seed();
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120, 160, 255,' + p.a + ')';
        ctx.fill();
      }
      /* connect close particles with faint lines */
      for (var a = 0; a < particles.length; a++) {
        for (var b = a + 1; b < particles.length; b++) {
          var dx = particles[a].x - particles[b].x;
          var dy = particles[a].y - particles[b].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 130 * 130) {
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.strokeStyle = 'rgba(79, 125, 255,' + (0.06 * (1 - d2 / (130 * 130))).toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    draw();

    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) draw();
    });
  }
})();
