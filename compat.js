/* World Adventure compatibility shim (6 Nov 2026). Drew's kids' tablet runs a 2019 browser engine (Chrome 75 inside its
   safe browser, 1 GB of memory): every script feature the app needs is there, the newer layout features are not, and the
   map library cannot even be read by it. This file is plain old JavaScript on purpose (no arrows, let/const or template
   strings) and loads first. It fills two missing calls and marks <html> with what the stylesheet and the app need to know:
     old     no `inset` (Chrome < 87): the layout fallbacks in styles.css apply
     no-gap  flexbox `gap` missing (Chrome < 84): spacing comes from margins instead
     lite    little memory or an old engine: no confetti, no animations, no globe or map
   Settings can force lite on or off on a device (localStorage lite = '1' or '0'); otherwise it is automatic. */
(function () {
  function reader(kind) {
    return function () {
      var b = this;
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(r.result); };
        r.onerror = function () { rej(r.error || new Error('could not read the file')); };
        if (kind === 'text') r.readAsText(b); else r.readAsArrayBuffer(b);
      });
    };
  }
  if (window.Blob && !Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = reader('buffer');   /* Chrome 76: pictures are sealed from blob.arrayBuffer() */
  if (window.Blob && !Blob.prototype.text) Blob.prototype.text = reader('text');

  var de = document.documentElement, cls = [];
  function sup(p, v) { try { return !!(window.CSS && CSS.supports && CSS.supports(p, v)); } catch (e) { return false; } }
  var old = !sup('inset', '0');
  var noGap = old;                                   /* no supports() test tells flex gap from grid gap, so measure it */
  try {
    var f = document.createElement('div');
    f.style.cssText = 'display:flex;flex-direction:column;gap:10px;position:absolute;visibility:hidden;left:-99px;top:-99px';
    f.appendChild(document.createElement('div')); f.appendChild(document.createElement('div'));
    de.appendChild(f); noGap = f.scrollHeight !== 10; de.removeChild(f);
  } catch (e) { /* keep the guess */ }
  var pref = null;
  try { pref = localStorage.getItem('lite'); } catch (e) { pref = null; }
  var lowMem = !!(navigator.deviceMemory && navigator.deviceMemory <= 1);
  var lite = pref === '1' || (pref !== '0' && (lowMem || old));
  if (old) cls.push('old');
  if (noGap) cls.push('no-gap');
  if (lite) cls.push('lite');
  if (cls.length) de.className = (de.className ? de.className + ' ' : '') + cls.join(' ');
  window.Compat = { old: old, noGap: noGap, lite: lite, lowMem: lowMem, forced: pref === '1' || pref === '0' };
})();
