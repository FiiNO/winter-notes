/* Travel Dossier score sync client (31 Oct 2026). Talks to the Worker in ../sync/worker.js: the one place this app
   reaches beyond its own origin, and only when the family blob carries a sync address. It sends the facts this
   device authored (quest ticks, food notes, approvals: names, ids, dates) and pulls every device's facts for
   Quests.mergeRemote. No trip data, no vault data, no location ever goes out. Offline it simply waits. */
'use strict';
window.Sync = (() => {
  const C = { url: '', room: '', device: '', mine: null, apply: null, meta: null, onStatus: null,
    timer: null, pushTimer: null, dirty: false, busy: false, last: null, error: null, enabled: false, devices: 0, started: false };

  async function sha256hex(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function start(cfg) {
    C.url = String(cfg.url || '').trim().replace(/\/+$/, '');
    C.device = cfg.device; C.mine = cfg.mine; C.apply = cfg.apply; C.meta = cfg.meta || (() => ({}));
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
  async function pull() {
    const r = await fetch(`${C.url}/r/${C.room}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    C.devices = Object.keys(j.devices || {}).length;
    C.apply(j.devices || {});
  }
  async function push() {
    const body = JSON.stringify({ facts: C.mine(), ...C.meta() });
    const r = await fetch(`${C.url}/r/${C.room}/${C.device}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    C.dirty = false;
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
  }
  function touch() {                                // a local fact changed: push soon (debounced)
    if (!C.enabled) return;
    C.dirty = true; clearTimeout(C.pushTimer); C.pushTimer = setTimeout(sync, 2500); note();
  }
  function status() { return { enabled: C.enabled, last: C.last, error: C.error, dirty: C.dirty, devices: C.devices, busy: C.busy }; }
  function note() { if (C.onStatus) { try { C.onStatus(status()); } catch (e) { /* UI not ready */ } } }

  return { start, sync, touch, status, onStatus: (fn) => { C.onStatus = fn; } };
})();
