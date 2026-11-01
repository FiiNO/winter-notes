/* World Adventure media (1 Nov 2026): photos and drawings for the journal, shared between the family's devices.
   Every picture is shrunk on the device (photo: 1280 px JPEG plus a 320 px thumbnail; drawing: PNG up to 1024 px)
   and sealed with AES-GCM under the media key that build.py derives from the family passphrase and ships inside
   the family blob (trip.sync.media). Only ciphertext goes to the Worker (sync/worker.js: PUT and GET
   /m/{room}/{id}, bytes and nothing else) and only ciphertext sits in IndexedDB here; plaintext exists in memory
   alone, as the object URL behind the <img> that shows it. Re-encoding strips EXIF (GPS included). Loaded after
   sync.js and before quests.js; it touches app.js helpers (idb, $) and Sync/Quests at call time only. */
'use strict';
window.Media = (() => {
  const LIMITS = { full: 1280, thumb: 320, draw: 1024, qFull: 0.8, qThumb: 0.72, maxBytes: 1.5 * 1024 * 1024, lru: 80 };
  const M = { key: null, enabled: false, urls: new Map(), order: [], inflight: new Map(), flushing: false, backoffUntil: 0,
    pending: 0, queue: Promise.resolve(), active: 0, waiters: [], onChange: null };
  const enc = (s) => new TextEncoder().encode(String(s));

  /* base64 in chunks: a photo-sized buffer would overflow a spread into String.fromCharCode */
  function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }
  function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  /* ---------------------------------------------------------------- the key and the two seals */
  async function init(b64key) {
    M.key = null; M.enabled = false;
    if (!b64key) return false;
    try { M.key = await crypto.subtle.importKey('raw', unb64(b64key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); M.enabled = true; }
    catch (e) { M.enabled = false; }
    return M.enabled;
  }
  const need = () => { if (!M.enabled) throw new Error('Photos and pages need a full rebuild of the app: this build has no media key.'); };
  async function sealBytes(bytes, aad) {             // object bytes: IV(12) || AES-GCM(ct || tag), AAD = the object id
    need();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc(aad) }, M.key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return out.buffer;
  }
  function openBytes(buf, aad) {
    need();
    const u = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12), additionalData: enc(aad) }, M.key, u.subarray(12));
  }
  async function seal(obj, aad) {                    // a fact value: {iv, ct} base64, AAD = the fact key (a value cannot be moved under another key)
    need();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc(aad) }, M.key, enc(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(v, aad) {                      // null on anything wrong: never throws into a render
    if (!M.enabled || !v || typeof v !== 'object' || !v.iv || !v.ct) return null;
    try { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv), additionalData: enc(aad) }, M.key, unb64(v.ct)); return JSON.parse(new TextDecoder().decode(pt)); }
    catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- IndexedDB store "media" (app.js idb(), database version 2)
     record: {id, k: 'photo'|'thumb'|'drawing', ct: ArrayBuffer, n, up: 0|1, bad, at, p, d, tag, w, h} */
  async function store(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const t = db.transaction('media', mode); const r = fn(t.objectStore('media')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  const dbGet = (id) => store('readonly', (s) => s.get(id));
  const dbPut = (rec) => store('readwrite', (s) => s.put(rec));
  const dbDel = (id) => store('readwrite', (s) => s.delete(id));
  const dbAll = () => store('readonly', (s) => s.getAll());
  const dbClear = () => store('readwrite', (s) => s.clear());

  /* ---------------------------------------------------------------- pictures in: decode, shrink, seal, store */
  function loadImage(file) {                         // through <img>: iOS and Chrome apply the EXIF orientation there
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      let done = false;
      const ok = () => { if (done) return; done = true; URL.revokeObjectURL(url); res(img); };
      const bad = () => { if (done) return; done = true; URL.revokeObjectURL(url); rej(new Error('That photo could not be read. Try the camera button, or pick a JPEG.')); };
      img.onload = ok; img.onerror = bad; img.src = url;
      if (img.decode) img.decode().then(ok, () => { /* onload or onerror decides */ });
    });
  }
  let canvas = null;                                 // one reused canvas, zeroed after each use (iOS counts canvas memory tightly)
  function fit(w, h, max) { const s = Math.min(1, max / Math.max(w, h, 1)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; }
  function toBlob(c, type, q) { return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the picture.'))), type, q)); }
  async function shrink(src, max, type, q) {
    canvas = canvas || document.createElement('canvas');
    const [w, h] = fit(src.naturalWidth || src.width, src.naturalHeight || src.height, max);
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    g.drawImage(src, 0, 0, w, h);
    const blob = await toBlob(canvas, type, q);
    canvas.width = canvas.height = 0;
    return { blob, w, h };
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function enqueue(fn) { const p = M.queue.then(fn, fn); M.queue = p.catch(() => {}); return p; }
  async function storeObject(id, blob, meta) {
    const ct = await sealBytes(new Uint8Array(await blob.arrayBuffer()), id);
    await dbPut({ id, ct, n: ct.byteLength, up: 0, bad: 0, k: meta.k, p: meta.p, d: meta.d, tag: meta.tag || '', w: meta.w, h: meta.h, at: meta.at });
  }
  /* one tap on a hidden file input: call this synchronously inside the tap handler (iOS opens nothing otherwise) */
  function pick(opts) {
    const input = $(opts && opts.camera ? '#pick-camera' : '#pick-library');
    return new Promise((res) => {
      input.value = '';
      input.onchange = () => { const files = [...(input.files || [])]; input.value = ''; res(files); };
      input.oncancel = () => res([]);
      input.click();
    });
  }
  function addImage(file, meta) {
    return enqueue(async () => {
      need();
      if (!file || !(/^image\//.test(file.type || '') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name || ''))) throw new Error('That is not a photo.');
      const img = await loadImage(file);
      const full = await shrink(img, LIMITS.full, 'image/jpeg', LIMITS.qFull);
      const th = await shrink(img, LIMITS.thumb, 'image/jpeg', LIMITS.qThumb);
      img.src = '';
      const id = newId(), at = Date.now();
      await storeObject(id + 't', th.blob, { k: 'thumb', p: meta.p, d: meta.d, tag: meta.tag, w: th.w, h: th.h, at });
      await storeObject(id, full.blob, { k: 'photo', p: meta.p, d: meta.d, tag: meta.tag, w: full.w, h: full.h, at });
      M.pending += 2; changed(); Sync.poke();
      return { id, w: full.w, h: full.h, n: full.blob.size };
    });
  }
  function addCanvas(cv, meta) {
    return enqueue(async () => {
      need();
      const out = await shrink(cv, LIMITS.draw, 'image/png');
      const id = newId(), at = Date.now();
      await storeObject(id, out.blob, { k: 'drawing', p: meta.p, d: meta.d, tag: meta.tag, w: out.w, h: out.h, at });
      M.pending += 1; changed(); Sync.poke();
      return { id, w: out.w, h: out.h, n: out.blob.size };
    });
  }

  /* ---------------------------------------------------------------- pictures out: local or fetched ciphertext → object URL (capped, revoked on release) */
  function remember(oid, u) {
    M.urls.set(oid, u); M.order.push(oid);
    while (M.order.length > LIMITS.lru) { const old = M.order.shift(); if (old !== oid && M.urls.has(old)) { URL.revokeObjectURL(M.urls.get(old)); M.urls.delete(old); } }
  }
  function release() { for (const u of M.urls.values()) URL.revokeObjectURL(u); M.urls.clear(); M.order.length = 0; }
  function gate() { if (M.active < 2) { M.active++; return Promise.resolve(); } return new Promise((res) => M.waiters.push(res)).then(() => { M.active++; }); }
  function ungate() { M.active--; const w = M.waiters.shift(); if (w) w(); }
  async function download(oid, kind) {
    const ep = Sync.endpoint();
    if (!ep.enabled || !navigator.onLine) return null;
    await gate();
    try {
      const r = await fetch(`${ep.url}/m/${ep.room}/${oid}`);
      if (!r.ok) return null;
      const ct = await r.arrayBuffer();
      if (ct.byteLength < 29) return null;
      const rec = { id: oid, ct, n: ct.byteLength, up: 1, bad: 0, k: kind || 'photo', at: Date.now() };
      await dbPut(rec);
      return rec;
    } catch (e) { return null; } finally { ungate(); }
  }
  function url(oid, kind) {
    if (!oid || !M.enabled) return Promise.resolve(null);
    if (M.urls.has(oid)) return Promise.resolve(M.urls.get(oid));
    if (M.inflight.has(oid)) return M.inflight.get(oid);
    const p = (async () => {
      let rec = await dbGet(oid);
      if (!rec) rec = await download(oid, kind);
      if (!rec) return null;
      try {
        const pt = await openBytes(rec.ct, oid);
        const u = URL.createObjectURL(new Blob([pt], { type: rec.k === 'drawing' ? 'image/png' : 'image/jpeg' }));
        remember(oid, u);
        return u;
      } catch (e) { return null; }
    })();
    M.inflight.set(oid, p);
    return p.finally(() => M.inflight.delete(oid));
  }
  async function has(oid) { return !!(await dbGet(oid)); }
  async function ensure(oid, kind) { if (await dbGet(oid)) return true; return !!(await download(oid, kind)); }

  /* ---------------------------------------------------------------- upload: after each sync (Sync's work hook), thumbs first
     The index fact media|<id> is written once a photo's two parts are up (a drawing's at once), so other devices
     never see an id they cannot fetch. Ids are fixed at capture, so a retry is an overwrite, never a duplicate. */
  async function flush() {
    if (M.flushing || !M.enabled || !navigator.onLine || Date.now() < M.backoffUntil) return;
    const ep = Sync.endpoint();
    if (!ep.enabled) return;
    M.flushing = true;
    try {
      const all = await dbAll();
      const pend = all.filter((r) => !r.up && (r.bad || 0) < 3).sort((a, b) => ((a.k === 'thumb' ? 0 : 1) - (b.k === 'thumb' ? 0 : 1)) || (a.at - b.at));
      M.pending = pend.length; changed();
      for (const rec of pend) {
        let r;
        try { r = await fetch(`${ep.url}/m/${ep.room}/${rec.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: rec.ct }); }
        catch (e) { M.backoffUntil = Date.now() + 60000; break; }                      // the connection dropped: a minute, then again
        if (r.status === 503 || r.status === 429) { M.backoffUntil = Date.now() + 600000; break; }   // KV quota: ten minutes
        if (!r.ok) { rec.bad = (rec.bad || 0) + 1; await dbPut(rec); continue; }
        rec.up = 1; await dbPut(rec); M.pending = Math.max(0, M.pending - 1); changed();
        await indexFact(rec);
      }
    } finally { M.flushing = false; changed(); }
  }
  async function indexFact(rec) {
    const base = rec.k === 'thumb' ? rec.id.slice(0, -1) : rec.id;
    let main = rec;
    if (rec.k !== 'drawing') { const a = await dbGet(base), b = await dbGet(base + 't'); if (!(a && a.up && b && b.up)) return; main = a; }
    const key = 'media|' + base;
    if (Quests.getFact(key)) return;
    Quests.setFact(key, await seal({ on: true, k: main.k, p: main.p, d: main.d, tag: main.tag || '', n: main.n, w: main.w, h: main.h, t: main.at }, key));
  }
  async function pendingList() { return (await dbAll()).filter((r) => !r.up && r.k !== 'thumb' && r.p); }
  function pendingCount() { return M.pending; }
  async function countPending() { try { M.pending = (await dbAll()).filter((r) => !r.up).length; } catch (e) { M.pending = 0; } changed(); return M.pending; }
  async function usage() { const all = await dbAll(); return { count: all.filter((r) => r.k !== 'thumb').length, bytes: all.reduce((n, r) => n + (r.n || 0), 0), pending: all.filter((r) => !r.up).length }; }
  async function remove(id) { for (const u of [id, id + 't']) { const v = M.urls.get(u); if (v) { URL.revokeObjectURL(v); M.urls.delete(u); } await dbDel(u); } }
  async function wipe() { release(); try { await dbClear(); } catch (e) { /* no store yet */ } M.pending = 0; }
  async function clearDownloaded() { release(); for (const r of await dbAll()) if (r.up) await dbDel(r.id); }
  function changed() { if (M.onChange) { try { M.onChange(); } catch (e) { /* UI not ready */ } } }

  return { init, get enabled() { return M.enabled; }, seal, open, pick, addImage, addCanvas, url, has, ensure, release, flush, pendingList, pendingCount,
    countPending, usage, remove, wipe, clearDownloaded, onChange: (fn) => { M.onChange = fn; }, LIMITS };
})();
