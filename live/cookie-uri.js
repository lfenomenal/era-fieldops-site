// ERA Live cookie page: shows the YouTube choice and lets it be made or changed, Refuz and Accept alike
(function () {
  'use strict';
  // must match app.js: key, version and the 6-month validity of the YouTube choice
  var KEY = 'era-live:consent', VERSION = 2, VALID = 182 * 864e5;
  var state = document.getElementById('consentState');
  var accept = document.getElementById('accept'), refuse = document.getElementById('refuse');

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      return c && c.v === VERSION && typeof c.yt === 'boolean' && typeof c.ts === 'number' && Date.now() - c.ts < VALID ? c : null;
    } catch (e) { return null; }
  }
  function choose(yt) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, yt: yt, ts: Date.now() })); } catch (e) { /* storage blocked */ }
    show();
  }
  function show() {
    var c = read();
    var when = c ? new Date(c.ts).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    state.classList.toggle('on', !!(c && c.yt));
    state.lastChild.textContent = !c
      ? 'Nu ai ales încă în acest browser. Camerele YouTube se încarcă doar după ce apeși „Accept”.'
      : c.yt
        ? 'Ai acceptat cookie-urile YouTube în acest browser pe ' + when + '.'
        : 'Ai refuzat cookie-urile YouTube în acest browser pe ' + when + '. ERA Live nu încarcă YouTube.';
    accept.setAttribute('aria-pressed', String(!!(c && c.yt)));
    refuse.setAttribute('aria-pressed', String(!!(c && !c.yt)));
  }
  accept.addEventListener('click', function () { choose(true); });
  refuse.addEventListener('click', function () { choose(false); });
  document.getElementById('wipe').addEventListener('click', function () {
    try {
      // list first: removing an entry can reorder the rest
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) { if (k && k.indexOf('era-live:') === 0) localStorage.removeItem(k); });
    } catch (e) { /* storage blocked */ }
    document.getElementById('wipeNote').hidden = false;
    show();
  });
  show();
})();
