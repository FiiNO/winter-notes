/* World Adventure postcards (1 Nov 2026 night): a story becomes a postcard picture for the grandparents. The app draws
   it on a canvas (the story's photo or drawing, a stamp with the city, the words, "Love, Vince") and hands the JPEG to
   the phone's share sheet, so Mail or WhatsApp carries it and nothing leaves the device any other way. On a parent
   phone "Share" is direct; on the kids' iPad "Ask Mum and Dad to send it" writes a `card|<postId>` fact that waits in
   the parents' approvals card, and the parent's ✓ opens the share sheet on the parent's phone (quests.js hands that ✓
   to sendApproved). A sent postcard ticks the `postcard` quest for the story's author. Loaded after journal.js and
   before app.js; uses Journal.post/cityOf, Media.url/ensure, Quests.*, and app.js helpers at call time only. */
'use strict';
window.Postcard = (() => {
  const W = 1600, H = 1067;                                           // a 3:2 postcard
  const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const MOOD = { amazing: '🤩', good: '😊', ok: '😐', tired: '😴', sad: '😢' };
  const P = { files: new Map(), urls: [] };                           // prepared files by post id; preview URLs to revoke

  const firstLine = (po) => (po.text || '').split('\n')[0].slice(0, 60) || (po.media && po.media.length ? 'A picture from our adventure' : 'Thinking of you');
  const placeOf = (city) => (city === 'Home' ? 'At home' : city === 'Air' ? 'In the air' : city);
  function cityColour(key) { try { return getComputedStyle(document.documentElement).getPropertyValue('--c-' + key).trim() || '#2A9D8F'; } catch (e) { return '#2A9D8F'; } }
  function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('picture')); i.src = url; }); }
  function wrap(g, text, maxW) {                                       // word-wrap for the canvas; keeps the story's own line breaks
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        const test = line ? line + ' ' + word : word;
        if (!line || g.measureText(test).width <= maxW) line = test; else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function words(po) { return `${po.q ? po.q + '\n' : ''}${po.text || ''}\n\nLove, ${Quests.label(po.p)}`; }

  /* ---------------------------------------------------------------- drawing the card */
  async function render(po) {
    const ctx = currentContext(), city = Journal.cityOf(po.d, ctx), key = Quests.CITY_KEY[city] || 'home', col = cityColour(key);
    const pic = (po.media || []).find((m) => m.k === 'photo') || (po.media || []).find((m) => m.k === 'drawing') || null;
    let img = null;
    if (pic) {
      const kind = pic.k === 'drawing' ? 'drawing' : 'photo';
      try { await Media.ensure(pic.id, kind); const u = await Media.url(pic.id, kind); if (u) img = await loadImg(u); } catch (e) { img = null; }
    }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#FFF8EE'; g.fillRect(0, 0, W, H);                                  // the card
    g.fillStyle = col; g.fillRect(0, 0, W, 28);                                         // the city band
    g.strokeStyle = '#D9CDBE'; g.lineWidth = 3; g.setLineDash([14, 10]); g.strokeRect(24, 52, W - 48, H - 76); g.setLineDash([]);
    const hasPic = !!img, textX = hasPic ? 1010 : 100, textW = hasPic ? 490 : W - 200;
    if (hasPic) {                                                                       // the picture: a tilted white-framed print, left two thirds
      const bx = 70, by = 110, bw = 880, bh = 760, inner = { w: bw - 24, h: bh - 24 };
      g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate(-2 * Math.PI / 180);
      g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = 26; g.shadowOffsetY = 12;
      g.fillStyle = '#fff'; g.fillRect(-bw / 2, -bh / 2, bw, bh);
      g.shadowColor = 'transparent';
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.max(inner.w / iw, inner.h / ih), dw = iw * s, dh = ih * s;
      g.save(); g.beginPath(); g.rect(-inner.w / 2, -inner.h / 2, inner.w, inner.h); g.clip(); g.drawImage(img, -dw / 2, -dh / 2, dw, dh); g.restore();
      g.restore();
    }
    const sx = W - 250, sy = 80, ss = 170;                                             // the stamp, top right
    g.save(); g.translate(sx, sy); g.rotate(4 * Math.PI / 180);
    g.fillStyle = '#fff'; roundRect(g, 0, 0, ss, ss, 14); g.fill();
    g.strokeStyle = col; g.lineWidth = 6; g.setLineDash([10, 8]); roundRect(g, 10, 10, ss - 20, ss - 20, 10); g.stroke(); g.setLineDash([]);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `84px ${FONT}`; g.fillStyle = '#000'; g.fillText(Quests.CITY_EMOJI[city] || '📍', ss / 2, ss / 2 - 8);
    g.font = `bold 18px ${FONT}`; g.fillStyle = col; g.fillText('WORLD ADVENTURE', ss / 2, ss - 30);
    g.restore();
    g.save(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 4; g.beginPath();                       // the postmark waves
    for (let i = 0; i < 3; i++) { const yy = sy + 50 + i * 26; g.moveTo(sx - 200, yy); g.bezierCurveTo(sx - 140, yy - 22, sx - 80, yy + 22, sx - 16, yy); }
    g.stroke(); g.restore();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';                               // the message
    let y = hasPic ? 300 : 280;
    g.fillStyle = '#1B1B2F'; g.font = `bold 44px ${FONT}`; g.fillText('Dear Grandma and Grandpa,', textX, y); y += 72;
    if (po.q) { g.font = `italic 28px ${FONT}`; g.fillStyle = '#5F6B7A'; for (const l of wrap(g, po.q, textW).slice(0, 2)) { g.fillText(l, textX, y); y += 36; } y += 12; }
    const size = hasPic ? 36 : 44, lh = hasPic ? 46 : 56, maxLines = hasPic ? 9 : 9;
    g.font = `${size}px ${FONT}`; g.fillStyle = '#1B1B2F';
    let lines = wrap(g, po.text || (pic ? 'Here is a picture from our adventure!' : 'Thinking of you from our adventure!'), textW);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + ' …'; }
    for (const l of lines) { g.fillText(l, textX, y); y += lh; }
    const sign = Math.max(y + 30, H - 180);
    g.font = `bold 40px ${FONT}`; g.fillStyle = '#1B1B2F'; g.fillText(`Love, ${Quests.label(po.p)}${MOOD[po.mood] ? ' ' + MOOD[po.mood] : ''}`, textX, sign);
    g.font = `bold 30px ${FONT}`; g.fillStyle = col; g.fillText(`${placeOf(city)} · ${fmtDate(po.d)}`, textX, sign + 50);
    const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the postcard.'))), 'image/jpeg', 0.88));
    cv.width = cv.height = 0;
    return { blob, missing: !!(pic && !img) };
  }
  function fileName(po) { return `Postcard_${Quests.label(po.p).replace(/[^\w]+/g, '')}_${po.d}.jpg`; }
  function prepare(id) {                                                               // the file ahead of the tap: iOS keeps share inside the tap only briefly
    if (P.files.has(id)) return P.files.get(id);
    const po = Journal.post(id); if (!po) return Promise.resolve(null);
    const p = render(po).then((r) => { if (r.missing) P.files.delete(id); return new File([r.blob], fileName(po), { type: 'image/jpeg', lastModified: Date.now() }); });
    P.files.set(id, p); p.catch(() => P.files.delete(id));
    return p;
  }
  function canShareFile(file) { try { return !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; } }
  async function share(file, po) {
    if (!canShareFile(file)) { const e = new Error('This device cannot hand a picture to Mail from the app. Download it and attach it yourself.'); e.name = 'NoShare'; throw e; }
    await navigator.share({ files: [file], title: `Postcard from ${Quests.label(po.p)}`, text: `${firstLine(po)} · World Adventure` });
  }
  function releaseUrls() { for (const u of P.urls) URL.revokeObjectURL(u); P.urls.length = 0; }

  /* ---------------------------------------------------------------- the preview (a modal) */
  async function openPreview(id) {
    const po = Journal.post(id); if (!po) return;
    releaseUrls();
    openModal(`<h2 class="h2">📮 Postcard</h2><div class="pc-preview" id="pc-preview"><p class="muted">Drawing the postcard…</p></div>`);
    let file = null;
    try { file = await prepare(id); } catch (e) { const el = $('#pc-preview'); if (el) el.innerHTML = `<div class="card red">${esc((e && e.message) || 'Could not draw the postcard.')}</div>`; return; }
    const el = $('#pc-preview'); if (!el || !file) return;                            // the modal closed meanwhile
    const url = URL.createObjectURL(file); P.urls.push(url);
    const st = Quests.cardStatus(id), parent = Quests.isParentDevice(), can = canShareFile(file);
    let html = `<img src="${url}" alt="Postcard"><div class="small muted pc-words">${esc(po.text || '')}</div><div class="row">`;
    if (parent) html += can ? `<button class="btn primary" id="pc-share">📤 Share</button>` : `<a class="btn primary" href="${url}" download="${esc(file.name)}">⬇️ Download the picture</a>`;
    else html += st.sent ? `<span class="chip">✓ Sent</span>` : st.pending ? `<span class="chip">⏳ Mum and Dad have it</span>` : `<button class="btn primary" id="pc-ask">📮 Ask Mum and Dad to send it</button>`;
    html += `<button class="btn" id="pc-copy">📋 Copy the words</button></div>`;
    html += `<p class="tiny muted">${parent ? (can ? 'Share opens Mail or WhatsApp with the postcard attached: pick the grandparents and send.' : 'Attach the downloaded picture to an email to the grandparents.') : 'Mum or Dad send it from their phone when they say yes.'}${st.sent ? ' Sent before; sending again is fine.' : ''}${st.rejected && !parent ? ' Last time they said not this time; you can ask again.' : ''}</p>`;
    el.innerHTML = html;
    const sh = $('#pc-share');
    if (sh) sh.onclick = async () => { sh.disabled = true; try { await share(file, po); Quests.approveCard(id); closeModal(); } catch (e) { sh.disabled = false; if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not share.'); } };
    const ask = $('#pc-ask'); if (ask) ask.onclick = () => { Quests.requestCard(id); closeModal(); };
    const cp = $('#pc-copy'); if (cp) cp.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(words(po)).then(() => { cp.textContent = '✓ Copied'; }, () => {}); };
  }
  /* the parent's ✓ on a waiting postcard: share from this phone, then mark it sent and tick the quest for the author */
  async function sendApproved(key) {
    const id = String(key || '').replace(/^card\|/, ''), po = Journal.post(id);
    if (!po) { alert('That story is gone.'); return false; }
    let file = null;
    try { file = await prepare(id); } catch (e) { alert((e && e.message) || 'Could not draw the postcard.'); return false; }
    if (!file) return false;
    try { await share(file, po); Quests.approveCard(id); return true; }
    catch (e) { if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not share.'); return false; }
  }

  return { render, prepare, share, openPreview, sendApproved, firstLine, canShareFile, releaseUrls };
})();
