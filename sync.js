/* Travel Dossier score sync client (31 Oct 2026; pictures 1 Nov). Talks to the Worker in ../sync/worker.js: the one
   place this app reaches beyond its own origin, and only when the family blob carries a sync address. It sends the
   facts this device authored (quest ticks, food notes, approvals: names, ids, dates; journal pages and picture index
   facts sealed by media.js) and pulls every device's facts for Quests.mergeRemote. After each sync it runs the
   `work` hook (media.js uploads pending pictures). No trip data, no vault data, no location ever goes out. Offline
   it simply waits. */
'use strict';
window.Sync = (() => {
  const C = { url: '', room: '', device: '', mine: null, apply: null, meta: null, work: null, onStatus: null, stamp: '',
    timer: null, pushTimer: null, dirty: false, busy: false, last: null, error: null, enabled: false, devices: 0, started: false };

  async function sha256hex(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function start(cfg) {
    C.url = String(cfg.url || '').trim().replace(/\/+$/, '');
    C.device = cfg.device; C.mine = cfg.mine; C.apply = cfg.apply; C.meta = cfg.meta || (() => ({})); C.work = cfg.work || null;
    if (!C.url || !cfg.token) { C.enabled = false; note(); return; }
    C.room = await sha256hex(cfg.token);
    C.enabled = true;
    if (!C.started) {
      C.started = true;
      C.timer = setInterval(() => { if (!document.hidden) sync(); }, 90000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
      window.addEventListener('online', () => sync());
    }
    C.dirty = true;                                 // first run: make sure our facts are up there
    await sync();
  }
  /* a request that gives up after 25 s (15 Nov 2026): one that hung, on hotel Wi-Fi with no internet behind it, held the
     "busy" flag and every later sync was dropped until the app was restarted */
  function request(url, opts) {
    if (typeof AbortController === 'undefined') return fetch(url, opts);
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 25000);
    return fetch(url, Object.assign({ signal: ac.signal }, opts)).then(
      (r) => { clearTimeout(timer); return r; },
      (e) => { clearTimeout(timer); throw (e && e.name === 'AbortError' ? new Error('no answer (timed out)') : e); });
  }
  async function pull() {
    const r = await request(`${C.url}/r/${C.room}${C.stamp ? '?v=' + encodeURIComponent(C.stamp) : ''}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.same) return;                             // the Worker saw our stamp: nothing changed
    const devices = j.devices || {};
    C.devices = Object.keys(devices).length;
    if (C.device && !devices[C.device]) C.dirty = true;   // the room does not list us (new room, or a lost index entry): push again
    C.apply(devices);
    C.stamp = j.v || '';                            // remembered only once the merge is done: a merge that failed is asked for again, not answered "same"
  }
  async function push() {
    C.dirty = false;                                // cleared before the facts are read: a change made while the request is on its way sets it again and goes with the next push (it used to be cleared afterwards, and that change sat unsent)
    try {
      const body = JSON.stringify({ facts: C.mine(), ...C.meta() });
      const r = await request(`${C.url}/r/${C.room}/${C.device}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      C.stamp = '';                                 // our own write changes the stamp: the next pull fetches everything
    } catch (e) { C.dirty = true; throw e; }
  }
  async function sync() {
    if (!C.enabled || C.busy) return;
    if (!navigator.onLine) { C.error = 'offline'; note(); return; }
    C.busy = true; note();
    try {
      if (C.dirty) await push();
      await pull();
      if (C.dirty) await push();                    // something changed while we were pulling
      C.last = Date.now(); C.error = null;
    } catch (e) { C.error = (e && e.message) || String(e); }
    finally { C.busy = false; note(); }
    if (C.work) { try { await C.work(); } catch (e) { /* an upload problem never flips the facts status */ } }
  }
  function touch() {                                // a local fact changed: push soon (debounced)
    if (!C.enabled) return;
    C.dirty = true; clearTimeout(C.pushTimer); C.pushTimer = setTimeout(sync, 2500); note();
  }
  function poke() {                                 // something to upload, no fact changed yet: sync soon, no push of facts
    if (!C.enabled) return;
    clearTimeout(C.pushTimer); C.pushTimer = setTimeout(sync, 1500);
  }
  function endpoint() { return { url: C.url, room: C.room, enabled: C.enabled }; }
  function status() { return { enabled: C.enabled, last: C.last, error: C.error, dirty: C.dirty, devices: C.devices, busy: C.busy }; }
  function note() { if (C.onStatus) { try { C.onStatus(status()); } catch (e) { /* UI not ready */ } } }

  return { start, sync, touch, poke, endpoint, status, onStatus: (fn) => { C.onStatus = fn; } };
})();
