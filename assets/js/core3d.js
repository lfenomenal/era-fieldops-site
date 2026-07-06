/* ERA FieldOPS — wide 3D data fabric (real 3D, vanilla canvas)
   A panoramic neural field spanning the full screen width: the platform's
   modules are spread left-to-right across a 3D mesh, with data streaming
   continuously from left to right. Cursor parts the mesh; hover focuses a
   module; click fires a ripple + pulse burst. */
(function () {
  'use strict';
  var stage = document.querySelector('.core3d-stage');
  var cv = document.getElementById('core3d');
  if (!stage || !cv) return;
  var ctx = cv.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE = Math.min(window.innerWidth, window.innerHeight) < 720 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var DPR = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);
  var W = 0, H = 0, S = 1, spanX = 2;

  var MODS = ['Clienți & Vânzări', 'Dispecerat', 'GPS & Flotă', 'Lucrări în teren',
    'Facturare & ANAF', 'Inspector AI', 'Mentenanță', 'Inventar',
    'Automatizări', 'Rapoarte', 'Aplicație mobilă'];

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // faint ambient cloud for connective texture
  var CLOUD_N = MOBILE ? 34 : 70;
  var cloud = [];
  for (var i = 0; i < CLOUD_N; i++) cloud.push({ nx: rnd(-1.05, 1.05), ny: rnd(-0.62, 0.62), nz: rnd(-0.9, 0.9), sx: 0, sy: 0, d: 0, sc: 1, ph: rnd(0, 6.283) });

  // modules spread left-to-right, layered in depth
  var mods = MODS.map(function (label, k) {
    var nx = -0.92 + k * (1.84 / (MODS.length - 1));
    var ny = (k % 2 ? 0.3 : -0.3) + rnd(-0.08, 0.08);
    var nz = ((k % 3) - 1) * 0.55 + rnd(-0.1, 0.1);
    return { nx: nx, ny: ny, nz: nz, sx: 0, sy: 0, d: 0, sc: 1, label: label, ph: rnd(0, 6.283) };
  });

  // real platform "feature" points woven across the whole field
  var FEATS = ['CCTV', 'Control acces', 'Alarme', 'Interfonie', 'Camere IP', 'Geofence',
    'Obiectiv', 'Tehnician', 'Vehicul', 'Client nou', 'Ofertă', 'Contract', 'Programare',
    'PV semnat', 'Semnătură', 'e-Factura', 'ANAF', 'SEAP', 'WhatsApp', 'Stoc',
    'Backup', 'GDPR', 'SLA', 'Poze din teren', 'Foaie de parcurs', 'Alertă CCTV', 'Încasări', 'Checklist'];
  var feats = FEATS.map(function (label) {
    return { nx: rnd(-1, 1), ny: rnd(-0.56, 0.56), nz: rnd(-0.85, 0.85), sx: 0, sy: 0, d: 0, sc: 1, label: label, m: 0, ph: rnd(0, 6.283) };
  });
  // link each feature to its nearest module
  feats.forEach(function (fn) {
    var bd = 1e9, bi = 0;
    mods.forEach(function (m, mi) { var dx = (fn.nx - m.nx) * 0.6, dy = fn.ny - m.ny, dz = fn.nz - m.nz, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; bi = mi; } });
    fn.m = bi;
  });

  // edges within the cloud (nearest 2, x weighted so horizontal links form)
  function dist2(a, b) { var dx = (a.nx - b.nx) * 0.6, dy = a.ny - b.ny, dz = a.nz - b.nz; return dx * dx + dy * dy + dz * dz; }
  var cloudEdges = [], seenC = {};
  cloud.forEach(function (a, ai) {
    var ds = [];
    cloud.forEach(function (b, bi) { if (ai === bi) return; ds.push([dist2(a, b), bi]); });
    ds.sort(function (p, q) { return p[0] - q[0]; });
    for (var k = 0; k < 2; k++) { var j = ds[k][1], key = Math.min(ai, j) + '_' + Math.max(ai, j); if (!seenC[key]) { seenC[key] = 1; cloudEdges.push([ai, j]); } }
  });
  // module <-> nearest 2 modules
  var modEdges = [], seenM = {};
  mods.forEach(function (a, ai) {
    var ds = [];
    mods.forEach(function (b, bi) { if (ai === bi) return; ds.push([dist2(a, b), bi]); });
    ds.sort(function (p, q) { return p[0] - q[0]; });
    for (var k = 0; k < 2; k++) { var j = ds[k][1], key = Math.min(ai, j) + '_' + Math.max(ai, j); if (!seenM[key]) { seenM[key] = 1; modEdges.push([ai, j]); } }
  });

  // left-to-right data flow particles
  var FLOW_N = MOBILE ? 26 : 60;
  var flow = [];
  for (var f = 0; f < FLOW_N; f++) flow.push({ nx: rnd(-1.1, 1.1), ny: rnd(-0.55, 0.55), nz: rnd(-0.85, 0.85), sp: rnd(0.004, 0.010) });

  var drift = 0, tiltX = 0, tiltY = 0, tTiltX = 0, tTiltY = 0, dragRX = 0, dragRY = 0, velX = 0, velY = 0;
  var dragging = false, lastX = 0, lastY = 0, ptype = 'mouse', mx = -999, my = -999, hover = -1, hoverF = -1;
  var downX = 0, downY = 0, moved = false, rings = [];
  var vis = false, running = false, intro = 0, last = 0;

  function resize() {
    var r = stage.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    S = H * 0.44;
    spanX = (W * 0.5) / S + 0.12;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize); resize();

  function burst(mi) {
    rings.push({ node: mods[mi], start: performance.now() });
    var added = 0;
    for (var i = 0; i < flowPulse.length && added < 4; i++) { if (Math.random() < 0.6) { flowPulse[i].mi = mi; flowPulse[i].t = 0; flowPulse[i].on = true; added++; } }
  }
  function ringAt(node) { rings.push({ node: node, start: performance.now() }); }
  // burst pulses that shoot outward from a clicked module along its edges
  var flowPulse = [];
  for (var b2 = 0; b2 < 6; b2++) flowPulse.push({ mi: 0, t: 1, on: false });

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
      dragRY += dx * 0.005; velY = dx * 0.005;
      if (ptype === 'mouse') { dragRX += dy * 0.004; velX = dy * 0.004; }
      lastX = e.clientX; lastY = e.clientY;
    } else { tTiltY = ((mx / W) - 0.5) * 0.5; tTiltX = ((my / H) - 0.5) * -0.35; }
  });
  window.addEventListener('pointerup', function () { if (dragging && !moved) { if (hover >= 0) burst(hover); else if (hoverF >= 0) ringAt(feats[hoverF]); } dragging = false; });
  stage.addEventListener('pointerleave', function () { if (!dragging) { mx = -999; my = -999; tTiltX = 0; tTiltY = 0; } });

  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { vis = es[0].isIntersecting; if (vis) start(); }, { threshold: 0.04 }).observe(stage);
  } else { vis = true; start(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else if (vis) start(); });

  function lerp(a, b, t) { return a + (b - a) * t; }
  var cosX, sinX, cosY, sinY, cx, cy, fov = 3.2;
  function P(nx, ny, nz) {
    var x = nx * spanX, y = ny, z = nz;
    var x1 = x * cosY + z * sinY, z1 = -x * sinY + z * cosY;
    var y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
    var denom = fov + z2; if (denom < 0.5) denom = 0.5; // never let perspective blow up
    var sc = fov / denom;
    return { sx: cx + x1 * sc * S, sy: cy - y1 * sc * S, d: z2, sc: sc };
  }
  function proj(list, wob) {
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var ny = n.ny + Math.sin(wob + n.ph) * 0.05;      // gentle continuous undulation
      var nz = n.nz + Math.cos(wob * 0.7 + n.ph) * 0.035;
      var r = P(n.nx, ny, nz); n.sx = r.sx; n.sy = r.sy; n.d = r.d; n.sc = r.sc;
    }
  }

  function loop(now) {
    if (!running || !vis) { running = false; return; }
    var dt = Math.min(2.2, (now - last) / 16.67); last = now;
    intro = Math.min(1, intro + (reduce ? 1 : 0.012 * dt));
    var ie = 1 - Math.pow(1 - intro, 3);
    drift = reduce ? 0 : Math.sin(now * 0.00018) * 0.14 + Math.sin(now * 0.00041) * 0.04;
    var sway = reduce ? 0 : Math.sin(now * 0.00013 + 1) * 0.07;
    if (!dragging) { dragRY += velY; dragRX += velX; velY *= 0.92; velX *= 0.92; }
    dragRY = Math.max(-0.55, Math.min(0.55, dragRY));   // clamp rotation so nodes never fall behind the camera
    dragRX = Math.max(-0.40, Math.min(0.40, dragRX));
    tiltX = lerp(tiltX, tTiltX, 0.06 * dt); tiltY = lerp(tiltY, tTiltY, 0.06 * dt);
    var ry = drift + tiltY + dragRY, rx = -0.13 + sway + tiltX + dragRX;
    cosY = Math.cos(ry); sinY = Math.sin(ry); cosX = Math.cos(rx); sinX = Math.sin(rx);
    cx = W / 2; cy = H / 2;
    var wobT = reduce ? 0 : now * 0.0012;

    proj(cloud, wobT); proj(mods, wobT); proj(feats, wobT);

    // cursor parts the mesh
    if (mx > -900 && !reduce) {
      var RR = Math.min(W, H) * 0.26, RR2 = RR * RR, STR = RR * 0.62;
      for (var rp = 0; rp < cloud.length; rp++) {
        var cnn = cloud[rp], rdx = cnn.sx - mx, rdy = cnn.sy - my, r2 = rdx * rdx + rdy * rdy;
        if (r2 < RR2 && r2 > 1) { var rd = Math.sqrt(r2), ff = (1 - rd / RR) * STR; cnn.sx += rdx / rd * ff; cnn.sy += rdy / rd * ff; }
      }
    }

    hover = -1; hoverF = -1;
    if (mx > -900) {
      var bo = 32 * 32, hi = -1;
      for (var h = 0; h < mods.length; h++) { var ddx = mods[h].sx - mx, ddy = mods[h].sy - my, dd = ddx * ddx + ddy * ddy; if (dd < bo) { bo = dd; hi = h; } }
      var boF = 24 * 24, hfi = -1;
      for (var hf = 0; hf < feats.length; hf++) { var fdx = feats[hf].sx - mx, fdy = feats[hf].sy - my, fd = fdx * fdx + fdy * fdy; if (fd < boF) { boF = fd; hfi = hf; } }
      if (hi >= 0 && (hfi < 0 || bo <= boF)) hover = hi; else if (hfi >= 0) hoverF = hfi;
    }

    ctx.clearRect(0, 0, W, H);

    // faint horizontal glow band
    var pl = 0.5 + 0.5 * Math.sin(now * 0.0015);
    var g = ctx.createLinearGradient(0, cy - H * 0.35, 0, cy + H * 0.35);
    g.addColorStop(0, 'rgba(5,8,22,0)');
    g.addColorStop(0.5, 'rgba(79,125,255,' + (0.05 * ie) + ')');
    g.addColorStop(1, 'rgba(5,8,22,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // cloud edges + nodes
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(79,125,255,' + (0.05 * ie) + ')'; ctx.beginPath();
    for (var c = 0; c < cloudEdges.length; c++) { var a = cloud[cloudEdges[c][0]], bb = cloud[cloudEdges[c][1]]; ctx.moveTo(a.sx, a.sy); ctx.lineTo(bb.sx, bb.sy); }
    ctx.stroke();
    for (var cn = 0; cn < cloud.length; cn++) { var n2 = cloud[cn], dn2 = (n2.d + 1) / 2; ctx.beginPath(); ctx.arc(n2.sx, n2.sy, (0.6 + dn2 * 1.2) * n2.sc, 0, 6.283); ctx.fillStyle = 'rgba(120,160,255,' + ((0.12 + dn2 * 0.26) * ie) + ')'; ctx.fill(); }

    // module <-> module edges (highlight hovered module's links)
    for (var me = 0; me < modEdges.length; me++) {
      var i0 = modEdges[me][0], i1 = modEdges[me][1], a3 = mods[i0], b3 = mods[i1];
      var conn = (hover === i0 || hover === i1), base = (0.08 + ((a3.d + b3.d) / 2 + 1) * 0.07) * ie;
      ctx.beginPath(); ctx.moveTo(a3.sx, a3.sy); ctx.lineTo(b3.sx, b3.sy);
      ctx.strokeStyle = conn ? 'rgba(0,212,255,' + (0.75 * ie) + ')' : 'rgba(0,212,255,' + (hover >= 0 ? base * 0.4 : base) + ')';
      ctx.lineWidth = conn ? 1.6 : 1; ctx.stroke();
    }

    // feature -> module links (brighten the hovered module's family)
    for (var fe = 0; fe < feats.length; fe++) {
      var fn = feats[fe], pm = mods[fn.m], famHot = (hover === fn.m || hoverF === fe);
      var fdep = (fn.d + 1) / 2;
      ctx.beginPath(); ctx.moveTo(fn.sx, fn.sy); ctx.lineTo(pm.sx, pm.sy);
      ctx.strokeStyle = famHot ? 'rgba(0,212,255,' + (0.55 * ie) + ')' : 'rgba(79,125,255,' + ((0.05 + fdep * 0.08) * ie * (hover >= 0 || hoverF >= 0 ? 0.5 : 1)) + ')';
      ctx.lineWidth = famHot ? 1.4 : 0.8; ctx.stroke();
    }
    // feature nodes + labels (depth sorted)
    var fOrder = feats.map(function (_, i) { return i; }).sort(function (aa, bb) { return feats[aa].d - feats[bb].d; });
    for (var fo = 0; fo < fOrder.length; fo++) {
      var fi = fOrder[fo], fn2 = feats[fi], fdn = (fn2.d + 1) / 2, isHF = fi === hoverF;
      var frr = (2 + fdn * 2) * fn2.sc; if (isHF) frr *= 1.5;
      ctx.beginPath(); ctx.arc(fn2.sx, fn2.sy, frr, 0, 6.283);
      if (isHF) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; }
      ctx.fillStyle = isHF ? '#fff' : 'rgba(0,212,255,' + ((0.35 + fdn * 0.45) * ie).toFixed(3) + ')';
      ctx.fill(); ctx.shadowBlur = 0;
      if (isHF || fdn > 0.7) {
        var fla = (isHF ? 1 : (fdn - 0.7) * 3.3) * ie;
        if (fla > 0.06) {
          ctx.font = '600 ' + (isHF ? 11.5 : 10) + 'px Satoshi, system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(5,8,22,' + (0.82 * fla).toFixed(2) + ')';
          ctx.strokeText(fn2.label, fn2.sx, fn2.sy - frr - 7);
          ctx.fillStyle = 'rgba(200,214,255,' + fla.toFixed(2) + ')';
          ctx.fillText(fn2.label, fn2.sx, fn2.sy - frr - 7);
        }
      }
    }

    // LEFT-TO-RIGHT data flow across the whole width
    for (var fl = 0; fl < flow.length; fl++) {
      var fp = flow[fl]; fp.nx += fp.sp * dt * (reduce ? 0 : 1); if (fp.nx > 1.12) fp.nx = -1.12;
      var r = P(fp.nx, fp.ny, fp.nz), dn = (r.d + 1) / 2;
      ctx.beginPath(); ctx.arc(r.sx, r.sy, 4.5 * r.sc, 0, 6.283); ctx.fillStyle = 'rgba(0,212,255,' + (0.16 * dn * ie) + ')'; ctx.fill();
      ctx.beginPath(); ctx.arc(r.sx, r.sy, 1.8 * r.sc, 0, 6.283); ctx.fillStyle = 'rgba(140,232,255,' + (0.9 * dn * ie) + ')'; ctx.fill();
    }

    // burst pulses shooting out along a clicked module's edges
    for (var bp = 0; bp < flowPulse.length; bp++) {
      var fpu = flowPulse[bp]; if (!fpu.on) continue; fpu.t += 0.03 * dt; if (fpu.t >= 1) { fpu.on = false; continue; }
      var src = mods[fpu.mi]; var tgt = mods[(fpu.mi + 1 + (bp % (mods.length - 1))) % mods.length];
      var px = lerp(src.sx, tgt.sx, fpu.t), py = lerp(src.sy, tgt.sy, fpu.t);
      ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.fillStyle = 'rgba(0,212,255,' + (1 - fpu.t) + ')'; ctx.shadowColor = '#00D4FF'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
    }

    // module nodes + labels, depth sorted
    var order = mods.map(function (_, i) { return i; }).sort(function (aa, bb) { return mods[aa].d - mods[bb].d; });
    for (var o = 0; o < order.length; o++) {
      var idx = order[o], m4 = mods[idx], dn4 = (m4.d + 1) / 2, isH = idx === hover;
      var rr = (3.4 + dn4 * 3.4) * m4.sc; if (isH) rr *= 1.5;
      ctx.beginPath(); ctx.arc(m4.sx, m4.sy, rr * 2.6, 0, 6.283); ctx.fillStyle = 'rgba(0,212,255,' + ((0.05 + dn4 * 0.06) * ie).toFixed(3) + ')'; ctx.fill();
      ctx.beginPath(); ctx.arc(m4.sx, m4.sy, rr, 0, 6.283);
      if (isH) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; }
      ctx.fillStyle = isH ? '#fff' : 'rgba(0,212,255,' + ((0.55 + dn4 * 0.45) * ie).toFixed(3) + ')';
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(m4.sx, m4.sy, rr + 4, 0, 6.283); ctx.strokeStyle = 'rgba(0,212,255,' + ((0.3 + dn4 * 0.4) * ie).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke();
      if (isH || dn4 > 0.45) {
        var la = (isH ? 1 : (dn4 - 0.45) * 1.8) * ie;
        if (la > 0.05) {
          ctx.font = '700 ' + (isH ? 13.5 : 11.5) + 'px Satoshi, system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,8,22,' + (0.85 * la).toFixed(2) + ')';
          ctx.strokeText(m4.label, m4.sx, m4.sy - rr - 9);
          ctx.fillStyle = 'rgba(237,241,255,' + la.toFixed(2) + ')';
          ctx.fillText(m4.label, m4.sx, m4.sy - rr - 9);
        }
      }
    }

    // click ripple rings
    for (var rk = rings.length - 1; rk >= 0; rk--) {
      var age = (now - rings[rk].start) / 700;
      if (age >= 1) { rings.splice(rk, 1); continue; }
      var rm = rings[rk].node;
      ctx.beginPath(); ctx.arc(rm.sx, rm.sy, 6 + age * 54, 0, 6.283);
      ctx.strokeStyle = 'rgba(0,212,255,' + ((1 - age) * 0.7) + ')'; ctx.lineWidth = 2.4 * (1 - age); ctx.stroke();
    }

    requestAnimationFrame(loop);
  }
})();
