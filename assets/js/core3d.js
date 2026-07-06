/* ERA FieldOPS — 3D module core (real 3D projection on canvas, vanilla)
   Each node is a real platform module, all feeding one central ERA core,
   with live data pulses flowing between modules and the core. */
(function () {
  'use strict';
  var stage = document.querySelector('.core3d-stage');
  var cv = document.getElementById('core3d');
  if (!stage || !cv) return;
  var ctx = cv.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE = Math.min(window.innerWidth, window.innerHeight) < 720 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var DPR = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);
  var W = 0, H = 0, RAD = 1;

  var MODS = ['Clienți & Vânzări', 'Dispecerat', 'GPS & Flotă', 'Lucrări în teren',
    'Facturare & ANAF', 'Inspector AI', 'Mentenanță', 'Inventar',
    'Automatizări', 'Rapoarte', 'Aplicație mobilă'];

  function fib(n, r) {
    var p = [], phi = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(Math.max(0, 1 - y * y)), th = phi * i;
      p.push({ x: Math.cos(th) * rad * r, y: y * r, z: Math.sin(th) * rad * r });
    }
    return p;
  }

  // meaningful "feature" dots (real platform things) around the core + labelled modules
  var FEATS = ['CCTV', 'Camere IP', 'Control acces', 'Alarme', 'Interfonie', 'Geofence', 'Obiectiv', 'Senzori',
    'Detector fum', 'Antiefracție', 'Tehnician', 'Echipă', 'Vehicul', 'Rută', 'Sosire GPS', 'Poze din teren',
    'Checklist', 'Semnătură', 'PV semnat', 'Programare', 'Lead', 'Ofertă', 'Deviz', 'Contract', 'e-Factura',
    'ANAF', 'SEAP', 'Încasare', 'Stoc', 'Serie echipament', 'Mentenanță', 'SLA', 'Inspector AI', 'Alertă CCTV',
    'Notificare', 'WhatsApp', 'Backup', 'GDPR', 'Raport', 'Foaie de parcurs'];
  var NF = MOBILE ? 30 : 64;
  var cloud = fib(NF, 1).map(function (p, i) {
    var rr = 0.5 + Math.random() * 0.48;
    return { x: p.x * rr, y: p.y * rr, z: p.z * rr, sx: 0, sy: 0, d: 0, sc: 1, label: FEATS[i % FEATS.length], ph: Math.random() * 6.283, ps: 0.6 + Math.random() * 0.7 };
  });
  var mods = fib(MODS.length, 1.2).map(function (p, i) { return { x: p.x, y: p.y, z: p.z, sx: 0, sy: 0, d: 0, sc: 1, label: MODS[i] }; });

  var cloudEdges = [];
  cloud.forEach(function (a, i) {
    var bd = 1e9, bj = -1;
    cloud.forEach(function (b, j) { if (i === j) return; var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; bj = j; } });
    if (bj > i) cloudEdges.push([i, bj]);
  });
  var modEdges = [], seen = {};
  mods.forEach(function (a, i) {
    var ds = [];
    mods.forEach(function (b, j) { if (i === j) return; var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; ds.push([dx * dx + dy * dy + dz * dz, j]); });
    ds.sort(function (p, q) { return p[0] - q[0]; });
    for (var k = 0; k < 2; k++) { var j = ds[k][1], key = Math.min(i, j) + '_' + Math.max(i, j); if (!seen[key]) { seen[key] = 1; modEdges.push([i, j]); } }
  });

  var pulses = [];
  for (var q = 0; q < (MOBILE ? 9 : 14); q++) {
    if (q % 2 === 0) pulses.push({ core: true, m: (Math.random() * mods.length) | 0, t: Math.random(), sp: 0.006 + Math.random() * 0.006 });
    else pulses.push({ core: false, e: (Math.random() * modEdges.length) | 0, t: Math.random(), sp: 0.006 + Math.random() * 0.006 });
  }

  var rotY = 0.5, rotX = -0.22, velY = 0, velX = 0;
  var tiltX = 0, tiltY = 0, tTiltX = 0, tTiltY = 0;
  var dragging = false, lastX = 0, lastY = 0, ptype = 'mouse', mx = -999, my = -999, hover = -1, featHover = -1;
  var downX = 0, downY = 0, moved = false, rings = [];
  var vis = false, running = false, intro = 0, last = 0;

  function resize() {
    var r = stage.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    RAD = Math.min(W, H) * 0.36;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize); resize();

  function burst(mi) {
    rings.push({ mi: mi, start: performance.now() });
    var added = 0;
    for (var i = 0; i < pulses.length && added < 5; i++) { if (Math.random() < 0.5) { pulses[i].core = true; pulses[i].m = mi; pulses[i].t = 0; pulses[i].sp = 0.012; added++; } }
  }
  stage.addEventListener('pointerdown', function (e) {
    ptype = e.pointerType; dragging = true; moved = false;
    lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY;
    var r = stage.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
  });
  stage.addEventListener('pointermove', function (e) {
    var r = stage.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
    if (dragging) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) moved = true;
      rotY += dx * 0.007; velY = dx * 0.007;
      if (ptype === 'mouse') { rotX += dy * 0.006; velX = dy * 0.006; }
      lastX = e.clientX; lastY = e.clientY;
    } else { tTiltY = ((mx / W) - 0.5) * 0.6; tTiltX = ((my / H) - 0.5) * -0.4; }
  });
  window.addEventListener('pointerup', function () {
    if (dragging && !moved && hover >= 0) burst(hover);
    dragging = false;
  });
  stage.addEventListener('pointerleave', function () { if (!dragging) { mx = -999; my = -999; tTiltX = 0; tTiltY = 0; } });

  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { vis = es[0].isIntersecting; if (vis) start(); }, { threshold: 0.05 }).observe(stage);
  } else { vis = true; start(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else if (vis) start(); });

  function lerp(a, b, t) { return a + (b - a) * t; }
  function proj(list, cosY, sinY, cosX, sinX, cx, cy, fov, s) {
    for (var i = 0; i < list.length; i++) {
      var n = list[i], X = n.x * s, Y = n.y * s, Z = n.z * s;
      var x1 = X * cosY + Z * sinY, z1 = -X * sinY + Z * cosY;
      var y1 = Y * cosX - z1 * sinX, z2 = Y * sinX + z1 * cosX;
      var sc = fov / (fov + z2);
      n.sx = cx + x1 * sc * RAD; n.sy = cy + y1 * sc * RAD; n.d = z2; n.sc = sc;
    }
  }

  function loop(now) {
    if (!running || !vis) { running = false; return; }
    var dt = Math.min(2.2, (now - last) / 16.67); last = now;
    intro = Math.min(1, intro + (reduce ? 1 : 0.012 * dt));
    var ie = 1 - Math.pow(1 - intro, 3);
    if (!dragging) { rotY += (reduce ? 0 : 0.0016) * dt + velY; rotX += velX; velY *= 0.93; velX *= 0.93; }
    tiltX = lerp(tiltX, tTiltX, 0.06 * dt); tiltY = lerp(tiltY, tTiltY, 0.06 * dt);
    var ry = rotY + tiltY, rx = rotX + tiltX;
    var cosY = Math.cos(ry), sinY = Math.sin(ry), cosX = Math.cos(rx), sinX = Math.sin(rx);
    var cx = W / 2, cy = H / 2, fov = 3.4;
    proj(cloud, cosY, sinY, cosX, sinX, cx, cy, fov, ie);
    proj(mods, cosY, sinY, cosX, sinX, cx, cy, fov, ie);

    hover = -1;
    if (mx > -900) { var best = 30 * 30; for (var h = 0; h < mods.length; h++) { var ddx = mods[h].sx - mx, ddy = mods[h].sy - my, dd = ddx * ddx + ddy * ddy; if (dd < best) { best = dd; hover = h; } } }

    ctx.clearRect(0, 0, W, H);

    var pl = 0.5 + 0.5 * Math.sin(now * 0.0015);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, RAD * (1.0 + pl * 0.1));
    g.addColorStop(0, 'rgba(0,212,255,' + (0.15 * ie) + ')');
    g.addColorStop(0.5, 'rgba(79,125,255,' + (0.06 * ie) + ')');
    g.addColorStop(1, 'rgba(5,8,22,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - RAD * 1.5, cy - RAD * 1.5, RAD * 3, RAD * 3);

    // feature links (faint)
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(79,125,255,' + (0.05 * ie) + ')'; ctx.beginPath();
    for (var c = 0; c < cloudEdges.length; c++) { var a = cloud[cloudEdges[c][0]], b = cloud[cloudEdges[c][1]]; ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); }
    ctx.stroke();
    // feature dots: always breathing + occasional flash + grow strongly near the cursor
    var PR = Math.min(W, H) * 0.2, fhBest = 0; featHover = -1;
    for (var cn = 0; cn < cloud.length; cn++) {
      var n2 = cloud[cn], dn2 = (n2.d + 1) / 2;
      var breathe = reduce ? 0 : 0.5 + 0.5 * Math.sin(now * 0.0016 * n2.ps + n2.ph);          // continuous pulse
      var tw = reduce ? 0 : Math.pow(0.5 + 0.5 * Math.sin(now * 0.0009 * n2.ps + n2.ph * 1.7), 8); // bright flash now and then
      var prox = 0;
      if (mx > -900) { var pdx = n2.sx - mx, pdy = n2.sy - my, pd = Math.sqrt(pdx * pdx + pdy * pdy); if (pd < PR) { prox = 1 - pd / PR; if (prox > fhBest) { fhBest = prox; featHover = cn; } } }
      var rad = (0.9 + dn2 * 1.4) * n2.sc * (1 + breathe * 0.55 + tw * 1.4 + prox * 3.4);
      var al = Math.min(1, (0.14 + dn2 * 0.3) * ie * (1 + breathe * 0.45 + tw * 1.2 + prox * 1.9));
      ctx.beginPath(); ctx.arc(n2.sx, n2.sy, rad, 0, 6.283);
      if (prox > 0.3 || tw > 0.5) { ctx.shadowColor = '#00D4FF'; ctx.shadowBlur = prox > 0.3 ? 13 * prox : 8 * tw; }
      ctx.fillStyle = prox > 0.5 ? 'rgba(210,242,255,' + al + ')' : 'rgba(130,195,255,' + al + ')';
      ctx.fill(); ctx.shadowBlur = 0;
    }
    // label the feature nearest the cursor (only when not focusing a module)
    if (featHover >= 0 && fhBest > 0.35 && hover < 0) {
      var fn = cloud[featHover];
      ctx.font = '600 11.5px Satoshi, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(5,8,22,0.85)';
      ctx.strokeText(fn.label, fn.sx, fn.sy - 11);
      ctx.fillStyle = 'rgba(215,238,255,0.96)';
      ctx.fillText(fn.label, fn.sx, fn.sy - 11);
    }

    // module -> core links (dim the rest when one is focused)
    for (var mi = 0; mi < mods.length; mi++) {
      var m = mods[mi], dep = (m.d + 1) / 2, hot = (hover === mi);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(m.sx, m.sy);
      ctx.strokeStyle = hot ? 'rgba(0,212,255,' + (0.8 * ie) + ')' : 'rgba(79,125,255,' + ((0.1 + dep * 0.16) * ie * (hover >= 0 ? 0.45 : 1)) + ')';
      ctx.lineWidth = hot ? 1.8 : 1; ctx.stroke();
    }
    // module <-> module (highlight the hovered module's links)
    for (var me = 0; me < modEdges.length; me++) {
      var i0 = modEdges[me][0], i1 = modEdges[me][1], a3 = mods[i0], b3 = mods[i1];
      var conn = (hover === i0 || hover === i1), base = (0.06 + ((a3.d + b3.d) / 2 + 1) * 0.06) * ie;
      ctx.beginPath(); ctx.moveTo(a3.sx, a3.sy); ctx.lineTo(b3.sx, b3.sy);
      ctx.strokeStyle = conn ? 'rgba(0,212,255,' + (0.75 * ie) + ')' : 'rgba(0,212,255,' + (hover >= 0 ? base * 0.4 : base) + ')';
      ctx.lineWidth = conn ? 1.6 : 1; ctx.stroke();
    }

    // data pulses
    for (var p = 0; p < pulses.length; p++) {
      var pu = pulses[p]; pu.t += pu.sp * dt;
      if (pu.t >= 1) { pu.t = 0; if (pu.core) pu.m = (Math.random() * mods.length) | 0; else pu.e = (Math.random() * modEdges.length) | 0; }
      var ax, ay, bx, by;
      if (pu.core) { var mm = mods[pu.m]; ax = mm.sx; ay = mm.sy; bx = cx; by = cy; }
      else { var ea = mods[modEdges[pu.e][0]], eb = mods[modEdges[pu.e][1]]; ax = ea.sx; ay = ea.sy; bx = eb.sx; by = eb.sy; }
      var px = lerp(ax, bx, pu.t), py = lerp(ay, by, pu.t);
      ctx.beginPath(); ctx.arc(px, py, 5, 0, 6.283); ctx.fillStyle = 'rgba(0,212,255,' + (0.22 * ie) + ')'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 2, 0, 6.283); ctx.fillStyle = 'rgba(140,232,255,' + (0.95 * ie) + ')'; ctx.fill();
    }

    // module nodes + labels (depth sorted)
    var order = mods.map(function (_, i) { return i; }).sort(function (a, b) { return mods[a].d - mods[b].d; });
    for (var o = 0; o < order.length; o++) {
      var idx = order[o], m4 = mods[idx], dn4 = (m4.d + 1) / 2, isH = idx === hover;
      var rr = (3.2 + dn4 * 3) * m4.sc; if (isH) rr *= 1.55;
      // cheap soft halo (no shadowBlur)
      ctx.beginPath(); ctx.arc(m4.sx, m4.sy, rr * 2.6, 0, 6.283);
      ctx.fillStyle = 'rgba(0,212,255,' + ((0.05 + dn4 * 0.06) * ie).toFixed(3) + ')'; ctx.fill();
      // node — glow only on the hovered one
      ctx.beginPath(); ctx.arc(m4.sx, m4.sy, rr, 0, 6.283);
      if (isH) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16; }
      ctx.fillStyle = isH ? '#ffffff' : 'rgba(0,212,255,' + ((0.55 + dn4 * 0.45) * ie).toFixed(3) + ')';
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(m4.sx, m4.sy, rr + 4, 0, 6.283); ctx.strokeStyle = 'rgba(0,212,255,' + ((0.3 + dn4 * 0.4) * ie).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke();
      // label: only front-facing modules or the hovered one (declutter), crisp stroke for contrast
      if (isH || dn4 > 0.5) {
        var la = (isH ? 1 : (dn4 - 0.5) * 2) * ie;
        if (la > 0.04) {
          ctx.font = '700 ' + (isH ? 13 : 11.5) + 'px Satoshi, system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,8,22,' + (0.85 * la).toFixed(2) + ')';
          ctx.strokeText(m4.label, m4.sx, m4.sy - rr - 8);
          ctx.fillStyle = 'rgba(237,241,255,' + la.toFixed(2) + ')';
          ctx.fillText(m4.label, m4.sx, m4.sy - rr - 8);
        }
      }
    }

    // core "ERA"
    ctx.beginPath(); ctx.arc(cx, cy, 10 + pl * 2, 0, 6.283); ctx.fillStyle = 'rgba(79,125,255,' + (0.9 * ie) + ')';
    ctx.shadowColor = '#4F7DFF'; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = '800 13px Satoshi, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(237,241,255,' + ie + ')'; ctx.fillText('ERA', cx, cy + 28);

    // click ripple rings on modules
    for (var rk = rings.length - 1; rk >= 0; rk--) {
      var age = (now - rings[rk].start) / 700;
      if (age >= 1) { rings.splice(rk, 1); continue; }
      var rm = mods[rings[rk].mi];
      ctx.beginPath(); ctx.arc(rm.sx, rm.sy, 6 + age * 52, 0, 6.283);
      ctx.strokeStyle = 'rgba(0,212,255,' + ((1 - age) * 0.7) + ')'; ctx.lineWidth = 2.4 * (1 - age); ctx.stroke();
    }

    requestAnimationFrame(loop);
  }
})();
