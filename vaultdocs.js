/* World Adventure: tickets and documents in the Vault (21 Nov 2026).
   Andy: "add in the vault all of our tickets, QR codes and boarding passes as an image or a document and be able to
   download it from the app."

   What it is: inside the open Vault, a list of pictures and files (a boarding pass screenshot, a PDF ticket, a QR code).
   Add one from the phone, give it a name and a day, show it full screen, save or share it back out.

   How it is kept safe: every document is sealed on the phone before it is stored (AES-256-GCM). The key comes from the
   VAULT passphrase (PBKDF2-SHA256, 600,000 rounds, a fixed salt), so it is the same on every phone that knows that
   passphrase and on no other; it is asked for once per phone and kept like the Vault's own key (never readable). The
   kids' tablet and a guest copy never have it.

   How the phones share them: the sealed bytes go to the family's sync room like a picture does (PUT /m/room/id), and a
   sealed line about each one (name, kind, size, day) travels as a fact, "vdoc|<id>". A deleted one leaves the plain
   mark { off: 1 }. Fetching and sending sealed bytes needs no key, so a phone collects them in the background and has
   them at the airport even if the Vault was never opened at home. Nothing here is in the trip book or the search. */
'use strict';
window.VaultDocs = (() => {
  const PREFIX = 'vdoc|', STORE = 'vdoc:', KEY = 'key:vaultdocs', MAX = 6 * 1048576, SHRINK_OVER = 2.5 * 1048576;
  const te = new TextEncoder(), td = new TextDecoder(), SALT = te.encode('world-adventure vault documents v1');
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const isPicture = (type) => /^image\//.test(type || '');
  const sizeText = (n) => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  let urls = {}, busy = false, wake = null, viewing = false;

  /* ---- the key */
  async function docsKey(pass) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations: 600000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const key = () => kvGet(KEY);
  async function keep(pass) { await kvSet(KEY, await docsKey(pass)); }           // the passphrase has just opened the Vault: no need to ask again
  async function turnOn(pass) {                                                  // on a phone whose Vault opens by PIN: the passphrase once, checked against the Vault itself
    const env = S.vaultEnv || (S.vaultEnv = await loadEnvelope('vault'));
    await decryptWith(await deriveKey(pass, env), env);                          // throws on a wrong passphrase
    await keep(pass);
  }
  async function seal(bytes, aad, k) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, k, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
  }
  async function unseal(u8, aad, k) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12), additionalData: te.encode(aad) }, k, u8.subarray(12))); }

  /* ---- the list (needs the key) and the sealed bytes (do not) */
  const facts = () => Quests.factsByPrefix(PREFIX);
  const live = (f) => !!(f && typeof f.v === 'string');
  async function list() {
    const k = await key(), out = [];
    if (!k) return out;
    for (const [fk, f] of Object.entries(facts())) {
      if (!live(f)) continue;
      const id = fk.slice(PREFIX.length);
      let m = null;
      try { m = JSON.parse(td.decode(await unseal(unb64(f.v), fk, k))); } catch (e) { m = null; }   // sealed with another passphrase's key: not ours to read
      if (!m || !m.on) continue;
      const rec = await kvGet(STORE + id);
      out.push({ id, name: m.name || 'Document', type: m.type || '', size: m.size || 0, date: m.date || '', note: m.note || '', t: m.t || f.t, here: !!rec, sent: !!(rec && rec.up) });
    }
    return out;
  }
  async function writeMeta(id, m, k) { Quests.setFact(PREFIX + id, b64(await seal(te.encode(JSON.stringify(m)), PREFIX + id, k))); }
  async function shrink(file) {                         // a big photo of a ticket: smaller, still sharp enough for a QR code
    try {
      const u = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      const s = Math.min(1, 2600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      const b = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
      return b && b.size < file.size ? new File([b], String(file.name || 'picture').replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
  }
  async function add(file) {
    const k = await key(); if (!k) throw new Error('Documents are not turned on for this phone yet.');
    if (isPicture(file.type) && file.size > SHRINK_OVER) file = await shrink(file);
    if (file.size > MAX) throw new Error(`"${file.name}" is ${sizeText(file.size)}: too big (the limit is ${sizeText(MAX)}).`);
    const bytes = new Uint8Array(await new Response(file).arrayBuffer()), id = Media.newId();
    await kvSet(STORE + id, { ct: await seal(bytes, id, k), up: false });
    await writeMeta(id, { on: true, name: String(file.name || 'Document').replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 80) || 'Document', type: file.type || 'application/octet-stream', size: bytes.length, date: '', note: '', t: Date.now() }, k);
    sync();
    return id;
  }
  async function update(d, change) {
    const k = await key(); if (!k) return;
    await writeMeta(d.id, { on: true, name: String(change.name || d.name).slice(0, 80), type: d.type, size: d.size, date: change.date === undefined ? d.date : change.date, note: String(change.note === undefined ? d.note : change.note).slice(0, 200), t: d.t }, k);
  }
  async function remove(id) { Quests.setFact(PREFIX + id, { off: 1 }); await kvDel(STORE + id); if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } }
  async function fetchSealed(id) {
    const ep = Sync.endpoint();
    if (!ep.enabled || navigator.onLine === false) return null;
    try { const r = await fetch(`${ep.url}/m/${ep.room}/${id}`); if (!r.ok) return null; const rec = { ct: new Uint8Array(await r.arrayBuffer()), up: true }; await kvSet(STORE + id, rec); return rec; }
    catch (e) { return null; }
  }
  async function file(d) {                              // the document itself, opened: null when its bytes are not to be had yet
    const k = await key(), rec = (await kvGet(STORE + d.id)) || (await fetchSealed(d.id));
    if (!k || !rec) return null;
    try { return new File([await unseal(rec.ct, d.id, k)], d.name + (/\.[a-z0-9]{2,5}$/i.test(d.name) ? '' : isPicture(d.type) ? (d.type === 'image/png' ? '.png' : '.jpg') : d.type === 'application/pdf' ? '.pdf' : ''), { type: d.type }); }
    catch (e) { return null; }
  }
  /* sealed bytes to and from the sync room: after every sync, when the app opens, after adding. No key needed. */
  async function sync() {
    if (busy) return; busy = true;
    try {
      const ep = Sync.endpoint(), on = ep.enabled && navigator.onLine !== false;
      for (const [fk, f] of Object.entries(facts())) {
        const id = fk.slice(PREFIX.length), rec = await kvGet(STORE + id);
        if (!live(f)) { if (rec) await kvDel(STORE + id); continue; }             // deleted on another phone: its bytes go here too
        if (!on) continue;
        if (!rec) await fetchSealed(id);
        else if (!rec.up) { try { const r = await fetch(`${ep.url}/m/${ep.room}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: rec.ct }); if (r.ok) { rec.up = true; await kvSet(STORE + id, rec); } } catch (e) { /* next time */ } }
      }
    } finally { busy = false; }
  }
  async function status() {                             // for "Ready to fly?": counted without the key
    let total = 0, missing = 0, waiting = 0;
    for (const [fk, f] of Object.entries(facts())) { if (!live(f)) continue; total++; const rec = await kvGet(STORE + fk.slice(PREFIX.length)); if (!rec) missing++; else if (!rec.up) waiting++; }
    return { total, missing, waiting, syncs: Sync.endpoint().enabled };
  }
  async function forget() { try { for (const k of await kvKeys()) if (String(k).indexOf(STORE) === 0) await kvDel(k); await kvDel(KEY); } catch (e) { /* nothing kept */ } }
  function lock() {                                     // the Vault locks: nothing opened stays on the screen or in memory
    for (const id of Object.keys(urls)) URL.revokeObjectURL(urls[id]);
    urls = {};
    if (wake) { try { wake.release(); } catch (e) { /* gone already */ } wake = null; }
    if (viewing) { viewing = false; if ($('#modal-inner .vdoc')) closeModal(); }
  }

  /* ---- the card in the open Vault */
  const dayLabel = (iso) => { const d = S.family.days.find((x) => x.date === iso); return d ? `${d.label} · ${Quests.dayCity(d)}` : fmtDate(iso); };
  async function render(el) {
    if (!el) return;
    const k = await key();
    if (!k) {
      el.innerHTML = `<div class="card"><div class="h2">➕ Added on the phone</div><p class="small muted">A boarding pass screenshot at check-in, a photo of a ticket, a PDF: added here from a phone, sealed, and shared with the other phone that knows the Vault passphrase. To turn this on for this phone, type the Vault passphrase once.</p>
        <form id="vdoc-on" autocomplete="off"><input id="vdoc-pp" type="password" autocapitalize="none" autocorrect="off" spellcheck="false" class="input" placeholder="Vault passphrase" required><button class="btn primary" type="submit">Turn on</button></form><p class="error hidden" id="vdoc-err"></p></div>`;
      el.querySelector('#vdoc-on').onsubmit = async (e) => {
        e.preventDefault();
        const err = el.querySelector('#vdoc-err'), b = el.querySelector('#vdoc-on button'); err.classList.add('hidden'); b.disabled = true; b.textContent = 'Checking…';
        try { await turnOn(el.querySelector('#vdoc-pp').value); sync(); render(el); }
        catch (ex) { b.disabled = false; b.textContent = 'Turn on'; err.textContent = 'That is not the Vault passphrase.'; err.classList.remove('hidden'); }
      };
      return;
    }
    const docs = await list(), today = currentContext().date;
    const rank = (d) => (d.date === today ? 0 : d.date > today ? 1 : d.date ? 3 : 2);          // today · coming up · no day · earlier
    docs.sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? (a.date < b.date ? 1 : -1) : a.date < b.date ? -1 : a.date > b.date ? 1 : a.t - b.t));
    const HEAD = ['Today', 'Coming up', 'No day set', 'Earlier'];
    let html = `<div class="card"><div class="h2">➕ Added on the phone</div>`, last = -1;
    if (!docs.length) html += `<p class="small muted">Nothing added yet. A boarding pass screenshot at check-in, a photo of a ticket or a PDF can be added here from this phone: it is sealed and shared with the other phone that knows the Vault passphrase.</p>`;
    for (const d of docs) {
      const r = rank(d); if (r !== last) { html += `<div class="h3">${HEAD[r]}</div>`; last = r; }
      html += `<button class="vdoc-row" data-vdoc="${esc(d.id)}"><span class="ico">${isPicture(d.type) ? '🖼️' : '📄'}</span><span class="bt"><span class="ik-name">${esc(d.name)}</span><span class="small muted">${d.date ? `<span class="ik-time">${esc(dayLabel(d.date))}</span> · ` : ''}${esc(sizeText(d.size))}${!d.here ? ' · <span class="red">not on this phone yet</span>' : !d.sent && Sync.endpoint().enabled ? ' · waiting to send' : ''}</span>${d.note ? `<span class="small muted">${esc(d.note)}</span>` : ''}</span><span class="chev">›</span></button>`;
    }
    html += `<div class="row"><button class="btn primary" id="vdoc-add">➕ Add a ticket or document</button></div><input type="file" id="vdoc-file" class="hidden" accept="image/*,application/pdf" multiple aria-hidden="true" tabindex="-1"><div class="small muted" id="vdoc-msg"></div></div>`;
    el.innerHTML = html;
    const input = el.querySelector('#vdoc-file'), msg = el.querySelector('#vdoc-msg');
    el.querySelector('#vdoc-add').onclick = () => { S.vaultHold = Date.now(); input.value = ''; input.click(); };   // choosing a file sends the app to the background for a moment: the Vault stays open for it
    input.onchange = async () => {
      const files = [].slice.call(input.files || []); S.vaultHold = 0; armVaultLock();
      if (!files.length) return;
      let added = [], problems = [];
      for (let i = 0; i < files.length; i++) { msg.textContent = `Sealing ${i + 1} of ${files.length}…`; try { added.push(await add(files[i])); } catch (e) { problems.push((e && e.message) || String(e)); } }
      await render(el);
      const m2 = el.querySelector('#vdoc-msg'); if (m2 && problems.length) m2.textContent = problems.join(' ');
      if (added.length === 1 && !problems.length) { const d = (await list()).find((x) => x.id === added[0]); if (d) edit(d, el); }   // one document: name it and give it its day straight away
    };
    el.querySelectorAll('[data-vdoc]').forEach((b) => b.onclick = () => { const d = docs.find((x) => x.id === b.dataset.vdoc); if (d) view(d, el); });
  }
  async function view(d, el) {
    openModal(`<div class="vdoc"><div class="vdoc-head"><div class="ik-name">${esc(d.name)}</div><div class="small muted">${d.date ? `<span class="ik-time">${esc(dayLabel(d.date))}</span> · ` : ''}${esc(sizeText(d.size))}</div>${d.note ? `<div class="small muted">${esc(d.note)}</div>` : ''}</div><div id="vdoc-body" class="vdoc-body"><div class="card">Opening…</div></div>
      <div class="row"><button class="btn primary" id="vdoc-save" disabled>⬇️ Save or share</button><button class="btn" id="vdoc-edit">✏️ Name and day</button><button class="btn" id="vdoc-del">🗑️ Delete</button></div></div>`);
    viewing = true;
    $('#vdoc-edit').onclick = () => edit(d, el);
    $('#vdoc-del').onclick = async () => { if (!confirm(`Delete "${d.name}" from the Vault on every phone?`)) return; await remove(d.id); viewing = false; closeModal(); render(el); };
    const f = await file(d), body = $('#vdoc-body');
    if (!body) return;                                  // closed, or the Vault locked, meanwhile
    if (!f) { body.innerHTML = `<div class="card">This document is not on this phone yet${Sync.endpoint().enabled ? ': it will arrive at the next sync, with internet' : ''}.</div>`; return; }
    const u = urls[d.id] || (urls[d.id] = URL.createObjectURL(f));
    if (isPicture(d.type)) {
      body.innerHTML = `<img class="vdoc-img" src="${u}" alt="${esc(d.name)}"><div class="tiny muted">Tap the picture to make it bigger. The screen stays on while this is open.</div>`;
      body.querySelector('img').onclick = (e) => e.target.classList.toggle('zoom');
      if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then((w) => { wake = w; }, () => {});
    } else body.innerHTML = `<div class="card centre"><div style="font-size:3em">📄</div><div>${esc(f.name)}</div><div class="row" style="justify-content:center"><a class="btn" href="${u}" target="_blank" rel="noopener">Open</a></div></div>`;
    const save = $('#vdoc-save'); save.disabled = false;
    save.onclick = async () => {
      try { if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: d.name }); else Media.saveDownload(f, f.name); }
      catch (e) { if (!e || e.name !== 'AbortError') Media.saveDownload(f, f.name); }
    };
  }
  function edit(d, el) {
    const days = S.family.days;
    openModal(`<div class="vdoc"><h2 class="h2">✏️ ${esc(d.name)}</h2><form id="vdoc-form" autocomplete="off">
      <label class="label" for="vd-name">Name</label><input id="vd-name" class="input" type="text" maxlength="80" value="${esc(d.name)}" required>
      <label class="label" for="vd-date">Which day is it for?</label><select id="vd-date" class="input"><option value="">No particular day</option>${days.map((x) => `<option value="${x.date}"${x.date === d.date ? ' selected' : ''}>${esc(x.label)} · ${esc(Quests.dayCity(x))}</option>`).join('')}</select>
      <label class="label" for="vd-note">Note (optional)</label><input id="vd-note" class="input" type="text" maxlength="200" value="${esc(d.note)}" placeholder="Seat 34A, gate closes 15:50…">
      <div class="row"><button class="btn primary" type="submit">Save</button></div></form></div>`);
    viewing = true;
    $('#vdoc-form').onsubmit = async (e) => { e.preventDefault(); await update(d, { name: $('#vd-name').value.trim() || d.name, date: $('#vd-date').value, note: $('#vd-note').value.trim() }); viewing = false; closeModal(); render(el); };
  }
  return { render, sync, status, keep, forget, lock, list, add, hasKey: () => key().then((k) => !!k) };
})();
