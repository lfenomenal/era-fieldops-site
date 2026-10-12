// ERA Live cookie page: shows the YouTube choice and lets it be withdrawn
(function () {
  'use strict';
  // must match the viewer: key, version and the 6-month validity of the YouTube choice
  var KEY = 'era-live:consent', VERSION = 1, VALID = 182 * 864e5;
  var state = document.getElementById('consentState'), revoke = document.getElementById('revoke');
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function show() {
    var c = read(), on = !!(c && c.yt === true && c.v === VERSION && typeof c.ts === 'number' && Date.now() - c.ts < VALID);
    state.classList.toggle('on', on);
    state.lastChild.textContent = on
      ? 'Ți-ai dat acordul pentru YouTube în acest browser pe ' + new Date(c.ts).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) + '.'
      : 'În acest browser nu ți-ai dat acordul pentru YouTube. Camerele se încarcă doar după ce apeși „Pornește camerele”.';
    revoke.hidden = !on;
  }
  revoke.addEventListener('click', function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    show();
  });
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
