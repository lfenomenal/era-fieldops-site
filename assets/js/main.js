/* ERA FieldOPS — interactions & animations */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Nav: blur on scroll ---------- */
  var nav = document.getElementById('nav');
  var lastScrolled = false;
  function onScroll() {
    var scrolled = window.scrollY > 24;
    if (scrolled !== lastScrolled) {
      nav.classList.toggle('scrolled', scrolled);
      lastScrolled = scrolled;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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

  /* ---------- Seamless logo marquee (duplicate content) ---------- */
  var track = document.getElementById('logoTrack');
  if (track) track.innerHTML += track.innerHTML;

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

  /* ---------- Hero: mouse parallax (desktop, no reduced motion) ---------- */
  var ccFrame = document.getElementById('ccFrame');
  var commandCenter = document.getElementById('commandCenter');
  if (ccFrame && !reduceMotion && matchMedia('(pointer: fine)').matches) {
    var raf = null, mx = 0, my = 0;
    document.addEventListener('mousemove', function (e) {
      mx = (e.clientX / window.innerWidth - 0.5);
      my = (e.clientY / window.innerHeight - 0.5);
      if (!raf) raf = requestAnimationFrame(applyParallax);
    }, { passive: true });
    function applyParallax() {
      raf = null;
      ccFrame.style.transform =
        'rotateY(' + (mx * 4).toFixed(2) + 'deg) rotateX(' + (-my * 3).toFixed(2) + 'deg)';
      commandCenter.querySelectorAll('.float-card').forEach(function (card, i) {
        var depth = (i % 3 + 1) * 6;
        card.style.marginLeft = (mx * depth).toFixed(1) + 'px';
        card.style.marginTop = (my * depth).toFixed(1) + 'px';
      });
    }
  }

  /* ---------- Hero: cycle floating notification cards ---------- */
  var cards = ['fc1', 'fc2', 'fc3', 'fc4', 'fc5', 'fc6']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  if (cards.length) {
    var visible = [];
    var idx = 0;
    function cycleCards() {
      var card = cards[idx % cards.length];
      card.classList.add('show');
      visible.push(card);
      if (visible.length > 3) visible.shift().classList.remove('show');
      idx++;
    }
    cycleCards(); cycleCards(); cycleCards();
    if (!reduceMotion) setInterval(cycleCards, 3200);
  }

  /* ---------- Hero: live feed ---------- */
  var feed = document.getElementById('ccFeed');
  if (feed) {
    var events = [
      { c: '#21D07A', t: 'PV #2841 semnat' },
      { c: '#00D4FF', t: 'Inspector AI: conform' },
      { c: '#4F7DFF', t: 'Echipa Bravo: sosire' },
      { c: '#FFB547', t: 'Alertă: cameră offline' },
      { c: '#21D07A', t: 'Factură acceptată ANAF' },
      { c: '#6D5BFF', t: 'Lead nou din site' },
      { c: '#00D4FF', t: 'Licitații AI: 96% match' },
      { c: '#21D07A', t: 'WhatsApp: confirmare' }
    ];
    var fIdx = 0;
    function pushFeed() {
      var ev = events[fIdx % events.length];
      var item = document.createElement('div');
      item.className = 'feed-item';
      var dot = document.createElement('i');
      dot.style.background = ev.c;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(ev.t));
      feed.appendChild(item);
      var items = feed.querySelectorAll('.feed-item');
      if (items.length > 3) items[0].remove();
      fIdx++;
    }
    pushFeed(); pushFeed(); pushFeed();
    if (!reduceMotion) setInterval(pushFeed, 2600);
  }

  /* ---------- Background particles ---------- */
  var canvas = document.getElementById('particles');
  if (canvas && !reduceMotion) {
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
