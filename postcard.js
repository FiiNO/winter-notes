/* World Adventure postcards (1 Nov 2026 night): a story becomes a postcard picture for the grandparents. The app draws
   it on a canvas (the story's photo or drawing, a stamp with the city, the words, "Love, Vince") and hands the JPEG to
   the phone's share sheet, so Mail or WhatsApp carries it and nothing leaves the device any other way. On a parent
   phone "Share" is direct; on the kids' iPad "Ask Mum and Dad to send it" writes a `card|<postId>` fact that waits in
   the parents' approvals card, and the parent's ✓ opens the share sheet on the parent's phone (quests.js hands that ✓
   to sendApproved). A sent postcard ticks the `postcard` quest for the story's author. Loaded after journal.js and
   before app.js; uses Journal.post/cityOf, Media.url/ensure, Quests.*, and app.js helpers at call time only.
   2 Nov 2026 (Andy: "instead of the same postcard every day lets have them change based on the city we are in and
   make them larger. If a story has multiple photos choose which one"): every city has its own look (greeting, motifs,
   one of three layouts), the card is 2400×1600 (a 6×4 inch print) with the picture as the hero, and the preview has
   a strip of the story's pictures to pick from; the kids' pick travels in the card| fact so the parent's ✓ sends it. */
'use strict';
window.Postcard = (() => {
  const W = 2400, H = 1600;                                           // a 3:2 postcard, 6×4 inches at 400 dpi
  const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const PAPER = '#FFF8EE', INK = '#1B1B2F', SOFT = '#5F6B7A';
  const MOOD = { amazing: '🤩', good: '😊', ok: '😐', tired: '😴', sad: '😢' };
  const P = { files: new Map(), urls: [], pick: {}, cards: new Map() };   // prepared files by post id + pick; preview URLs to revoke; the picker's choice per post; drawn feed cards (3 Nov 2026)

  /* the look of each city: a greeting, a set of motifs drawn faintly over the paper, and a layout. hero = the picture
     fills the left of the card edge to edge; print = a big white-framed print, slightly tilted; polaroid = a square
     print with the greeting on its white strip. Nothing here may name a venue the kids must not read about. */
  const LOOKS = {
    Tokyo: { greet: 'Konnichiwa from Tokyo!', motifs: ['🗼', '🍣', '🏮', '🌸', '🍜', '🚄'], layout: 'hero' },
    Nagoya: { greet: 'Konnichiwa from Nagoya!', motifs: ['🏯', '🍤', '🚄', '🍡', '🧱'], layout: 'print' },
    Vancouver: { greet: 'Hello from Vancouver!', motifs: ['🌲', '🏔️', '🦫', '⛵', '🌧️'], layout: 'hero' },
    Whistler: { greet: 'Hello from snowy Whistler!', motifs: ['⛷️', '❄️', '🏂', '⛄', '🚡', '🔥'], layout: 'polaroid' },
    Toronto: { greet: 'Hello from Toronto!', motifs: ['🍁', '🏒', '🗼', '🦝', '🍩'], layout: 'print' },
    'New York': { greet: 'Hello from New York!', motifs: ['🗽', '🚕', '🍕', '🌆', '🥨', '🎭'], layout: 'hero' },
    'Montréal': { greet: 'Bonjour from Montréal!', motifs: ['🥯', '🏒', '❄️', '⛪', '🍁', '🥞'], layout: 'polaroid' },
    Brisbane: { greet: "G'day from Brisbane!", motifs: ['🐨', '🌞', '🌴', '🦘', '🌉'], layout: 'print' },
    Cairns: { greet: "G'day from Cairns!", motifs: ['🐠', '🐢', '🌴', '🐊', '🤿', '🌊'], layout: 'hero' },
    Townsville: { greet: "G'day from Townsville!", motifs: ['🏡', '🌞', '🐚', '🌴'], layout: 'print' },
    Home: { greet: 'Hello from home!', motifs: ['🏡', '🧳', '🌏', '🎒'], layout: 'print' },
    Air: { greet: 'Hello from the sky!', motifs: ['✈️', '☁️', '🌍', '🛫'], layout: 'polaroid' },
  };
  const DEFAULT_LOOK = { greet: 'Hello from our adventure!', motifs: ['🌏', '🧳', '📸', '⭐'], layout: 'print' };
  const lookOf = (city) => LOOKS[city] || (city === 'Montreal' ? LOOKS['Montréal'] : null) || DEFAULT_LOOK;

  const firstLine = (po) => (po.text || '').split('\n')[0].slice(0, 60) || (po.media && po.media.length ? 'A picture from our adventure' : 'Thinking of you');
  const placeOf = (city) => (city === 'Home' ? 'At home' : city === 'Air' ? 'In the air' : city);
  function cityColour(key) { try { return getComputedStyle(document.documentElement).getPropertyValue('--c-' + key).trim() || '#2A9D8F'; } catch (e) { return '#2A9D8F'; } }
  function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('picture')); i.src = url; }); }
  function seeded(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }; }
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
  function picOf(po, pickId) {                                         // the picture on the card: the chosen one, else the first photo, else the first drawing
    const media = po.media || [];
    return (pickId && media.find((m) => m.id === pickId)) || media.find((m) => m.k === 'photo') || media.find((m) => m.k === 'drawing') || null;
  }

  /* ---------------------------------------------------------------- drawing the card */
  function drawCover(g, img, x, y, w, h) {                             // the picture cover-fit into a box, clipped
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore();
  }
  function drawHero(g, img, col, x, y, w, h) {                         // the whole picture, never cropped, over a soft blurred copy of itself (3 Nov 2026: cover-fit cut a landscape photo to its middle third)
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = col; g.fillRect(x, y, w, h);
    if ('filter' in g) { g.filter = 'blur(30px) saturate(1.15)'; drawCover(g, img, x - 60, y - 60, w + 120, h + 120); g.filter = 'none'; g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y, w, h); }
    else { g.globalAlpha = 0.3; drawCover(g, img, x, y, w, h); g.globalAlpha = 1; }   // older Safari: a faint copy over the city colour
    const pad = 44, s = Math.min((w - 2 * pad) / iw, (h - 2 * pad) / ih), dw = Math.round(iw * s), dh = Math.round(ih * s), dx = Math.round(x + (w - dw) / 2), dy = Math.round(y + (h - dh) / 2);
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = '#fff'; g.fillRect(dx - 12, dy - 12, dw + 24, dh + 24); g.shadowColor = 'transparent';
    g.drawImage(img, dx, dy, dw, dh);
    g.restore();
  }
  function drawMotifs(g, look, seed, region) {                         // faint motifs scattered over the paper (never over the picture)
    const rnd = seeded(seed), n = Math.round(region.w * region.h / 150000);
    g.save(); g.globalAlpha = 0.13; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const m = look.motifs[Math.floor(rnd() * look.motifs.length)], size = 90 + Math.floor(rnd() * 70);
      const x = region.x + 60 + rnd() * (region.w - 120), y = region.y + 60 + rnd() * (region.h - 120);
      g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.9); g.font = `${size}px ${FONT}`; g.fillStyle = '#000'; g.fillText(m, 0, 0); g.restore();
    }
    g.restore();
  }
  function drawStamp(g, city, col, date, sx, sy, ss) {                 // the stamp and the postmark waves to its left
    g.save(); g.translate(sx, sy); g.rotate(4 * Math.PI / 180);
    g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
    g.fillStyle = '#fff'; roundRect(g, 0, 0, ss, ss, 18); g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = col; g.lineWidth = 8; g.setLineDash([14, 11]); roundRect(g, 14, 14, ss - 28, ss - 28, 12); g.stroke(); g.setLineDash([]);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(ss * 0.46)}px ${FONT}`; g.fillStyle = '#000'; g.fillText(Quests.CITY_EMOJI[city] || '📍', ss / 2, ss / 2 - 22);
    g.font = `bold ${Math.round(ss * 0.082)}px ${FONT}`; g.fillStyle = col; g.fillText('WORLD ADVENTURE', ss / 2, ss - 58);
    g.font = `${Math.round(ss * 0.072)}px ${FONT}`; g.fillStyle = SOFT; g.fillText(date, ss / 2, ss - 34);
    g.restore();
    g.save(); g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 6; g.beginPath();
    for (let i = 0; i < 3; i++) { const yy = sy + ss * 0.3 + i * 38; g.moveTo(sx - 300, yy); g.bezierCurveTo(sx - 210, yy - 30, sx - 120, yy + 30, sx - 24, yy); }
    g.stroke(); g.restore();
  }
  function drawMessage(g, po, city, look, col, box) {                  // greeting, Dear…, the question, the words, Love…, place and date; fits the box
    const big = box.w > 1400, size = big ? 60 : 48, lh = big ? 78 : 62, maxLines = big ? 8 : 9;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    let y = box.y;
    g.font = `bold ${big ? 84 : 64}px ${FONT}`; g.fillStyle = col;
    for (const l of wrap(g, look.greet, box.w).slice(0, 2)) { g.fillText(l, box.x, y); y += big ? 96 : 74; }
    y += big ? 30 : 16;
    g.font = `bold ${big ? 62 : 52}px ${FONT}`; g.fillStyle = INK; g.fillText('Dear Grandma and Grandpa,', box.x, y); y += big ? 90 : 78;
    if (po.q) { g.font = `italic ${big ? 44 : 38}px ${FONT}`; g.fillStyle = SOFT; for (const l of wrap(g, po.q, box.w).slice(0, 2)) { g.fillText(l, box.x, y); y += big ? 54 : 46; } y += 16; }
    g.font = `${size}px ${FONT}`; g.fillStyle = INK;
    let lines = wrap(g, po.text || ((po.media || []).length ? 'Here is a picture from our adventure!' : 'Thinking of you from our adventure!'), box.w);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + ' …'; }
    for (const l of lines) { g.fillText(l, box.x, y); y += lh; }
    const sign = Math.max(y + 36, box.y + box.h - 120);
    g.font = `bold ${big ? 64 : 56}px ${FONT}`; g.fillStyle = INK; g.fillText(`Love, ${Quests.label(po.p)}${MOOD[po.mood] ? ' ' + MOOD[po.mood] : ''}`, box.x, sign);
    g.font = `bold ${big ? 44 : 40}px ${FONT}`; g.fillStyle = col; g.fillText(`${placeOf(city)} · ${fmtDate(po.d)}`, box.x, sign + (big ? 66 : 60));
  }
  async function render(po, pickId, opts) {
    const ctx = currentContext(), city = Journal.cityOf(po.d, ctx), key = Quests.CITY_KEY[city] || 'home', col = cityColour(key), look = lookOf(city);
    const pic = picOf(po, pickId);
    let img = null;
    if (pic) {
      const kind = pic.k === 'drawing' ? 'drawing' : 'photo';
      try { await Media.ensure(pic.id, kind); const u = await Media.url(pic.id, kind); if (u) img = await loadImg(u); } catch (e) { img = null; }
    }
    const sc = (opts && opts.scale) || 1;                                              // 0.5 for the cards in the grandparents' feed (3 Nov 2026)
    const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
    const g = cv.getContext('2d'); if (sc !== 1) g.scale(sc, sc);
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);                                       // the paper
    const seed = `${city}|${po.id}`, layout = img ? look.layout : 'words', stamp = 250;
    let box;                                                                           // where the message goes
    if (layout === 'hero') {                                                           // the left of the card is the picture: whole, on a blurred wash of itself
      drawMotifs(g, look, seed, { x: 1440, y: 0, w: W - 1440, h: H });
      drawHero(g, img, col, 0, 0, 1440, H);
      g.fillStyle = col; g.fillRect(1440, 0, 22, H);                                   // a city-colour spine between picture and words
      box = { x: 1540, y: 430, w: W - 1540 - 90, h: H - 430 - 90 };
    } else if (layout === 'print') {                                                   // a big white-framed print, slightly tilted
      drawMotifs(g, look, seed, { x: 0, y: 0, w: W, h: H });
      g.fillStyle = col; g.fillRect(0, 0, W, 40);                                      // the city band
      const bx = 100, by = 120, bw = 1340, bh = 1370, bd = 30;
      g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate(-1.5 * Math.PI / 180);
      g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 40; g.shadowOffsetY = 18; g.fillStyle = '#fff'; g.fillRect(-bw / 2, -bh / 2, bw, bh); g.shadowColor = 'transparent';
      drawCover(g, img, -bw / 2 + bd, -bh / 2 + bd, bw - 2 * bd, bh - 2 * bd);
      g.restore();
      box = { x: 1540, y: 440, w: W - 1540 - 90, h: H - 440 - 90 };
    } else if (layout === 'polaroid') {                                                // a square print with the greeting on its white strip
      drawMotifs(g, look, seed, { x: 0, y: 0, w: W, h: H });
      g.fillStyle = col; g.fillRect(0, 0, W, 40);
      const bw = 1300, bh = 1440, bd = 40, strip = 160, bx = 110, by = 80;
      g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate(-3 * Math.PI / 180);
      g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 40; g.shadowOffsetY = 18; g.fillStyle = '#fff'; g.fillRect(-bw / 2, -bh / 2, bw, bh); g.shadowColor = 'transparent';
      drawCover(g, img, -bw / 2 + bd, -bh / 2 + bd, bw - 2 * bd, bh - 2 * bd - strip);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic bold 64px ${FONT}`; g.fillStyle = col; g.fillText(look.greet, 0, bh / 2 - strip / 2 - 10);
      g.restore();
      box = { x: 1540, y: 440, w: W - 1540 - 90, h: H - 440 - 90 };
    } else {                                                                           // no picture: the words fill the card
      drawMotifs(g, look, seed, { x: 0, y: 0, w: W, h: H });
      g.fillStyle = col; g.fillRect(0, 0, W, 40);
      g.strokeStyle = '#D9CDBE'; g.lineWidth = 4; g.setLineDash([18, 14]); g.strokeRect(40, 80, W - 80, H - 120); g.setLineDash([]);
      box = { x: 160, y: 420, w: W - 160 - 440, h: H - 420 - 120 };
    }
    drawStamp(g, city, col, fmtDate(po.d), W - stamp - 70, 70, stamp);
    drawMessage(g, po, city, look, col, box);
    const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the postcard.'))), 'image/jpeg', sc < 1 ? 0.82 : 0.9));
    cv.width = cv.height = 0;
    return { blob, missing: !!(pic && !img), pic: pic ? pic.id : null, layout };
  }
  function fileName(po) { return `Postcard_${Quests.label(po.p).replace(/[^\w]+/g, '')}_${po.d}.jpg`; }
  function prepare(id, pickId) {                                                       // the file ahead of the tap: iOS keeps share inside the tap only briefly
    const ck = `${id}|${pickId || ''}`;
    if (P.files.has(ck)) return P.files.get(ck);
    const po = Journal.post(id); if (!po) return Promise.resolve(null);
    const p = render(po, pickId).then((r) => { if (r.missing) P.files.delete(ck); return new File([r.blob], fileName(po), { type: 'image/jpeg', lastModified: Date.now() }); });
    P.files.set(ck, p); p.catch(() => P.files.delete(ck));
    return p;
  }
  function cardUrl(id, pickId, scale) {                                                // a drawn card as an object URL, cached per story, pick and size (the grandparents' feed, 3 Nov 2026); a card still missing its picture is not cached
    const ck = `${id}|${pickId || ''}|${scale || 1}`;
    if (P.cards.has(ck)) return P.cards.get(ck);
    const po = Journal.post(id); if (!po) return Promise.resolve(null);
    const p = render(po, pickId, { scale: scale || 1 }).then((r) => { if (r.missing) P.cards.delete(ck); return { url: URL.createObjectURL(r.blob), missing: r.missing }; });
    P.cards.set(ck, p); p.catch(() => P.cards.delete(ck));
    return p;
  }
  /* which browser the app runs in, and whether its share sheet takes a picture (2 Nov 2026: Andy's phone showed
     Download instead of Share, so the preview and the Settings readout now say which browser and why) */
  const UA = navigator.userAgent || '';
  function browser() {
    const names = [[/SamsungBrowser\/[\d.]+/, 'Samsung Internet '], [/FxiOS\/[\d.]+/, 'Firefox iOS '], [/Firefox\/[\d.]+/, 'Firefox '], [/EdgA\/[\d.]+/, 'Edge '], [/Edg\/[\d.]+/, 'Edge '],
      [/OPR\/[\d.]+/, 'Opera '], [/CriOS\/[\d.]+/, 'Chrome iOS '], [/DuckDuckGo\/[\d.]+/, 'DuckDuckGo '], [/Chrome\/[\d.]+/, 'Chrome '], [/Version\/[\d.]+/, 'Safari ']];
    let name = 'unknown browser';
    for (const [re, label] of names) { const m = UA.match(re); if (m) { name = label + m[0].split('/')[1].split('.')[0]; break; } }
    let installed = false; try { installed = !!navigator.standalone || matchMedia('(display-mode: standalone)').matches; } catch (e) { /* none */ }
    const ios = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return `${name}${/; wv\)/.test(UA) ? ' app view' : ''}${installed ? ', installed' : ', tab'}${/Android/i.test(UA) ? ', Android' : ios ? ', iOS' : ''}`;
  }
  function shareInfo(file) {                                                         // has: a share sheet at all; files: does it take this picture (null = cannot tell)
    const has = typeof navigator.share === 'function', can = typeof navigator.canShare === 'function';
    let files = null;
    if (file && has && can) { try { files = !!navigator.canShare({ files: [file] }); } catch (e) { files = false; } }
    return { has, can, files, browser: browser() };
  }
  function canShareFile(file) { const i = shareInfo(file); return i.files === true || (i.has && i.files === null); }   // no canShare at all: try, the sheet decides
  function diag() {
    let probe = null; try { probe = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'probe.jpg', { type: 'image/jpeg' }); } catch (e) { /* no File */ }
    const i = shareInfo(probe);
    return `sheet ${i.has ? 'yes' : 'NO'} · canShare ${i.can ? 'yes' : 'no'} · picture ${i.files === null ? '?' : i.files ? 'yes' : 'NO'} · ${i.browser}`;
  }
  function noShare(info) { const e = new Error(`${info.browser} cannot hand the picture to Mail from the app. Save the picture, then attach it to the email.`); e.name = 'NoShare'; return e; }
  async function share(file, po) {
    const info = shareInfo(file);
    if (!canShareFile(file)) throw noShare(info);
    try { await navigator.share({ files: [file], title: `Postcard from ${Quests.label(po.p)}`, text: `${firstLine(po)} · World Adventure` }); }
    catch (e) { if (e && e.name === 'TypeError') throw noShare(info); throw e; }     // TypeError: this sheet takes no pictures; AbortError: cancelled
  }
  function releaseUrls() { for (const u of P.urls) URL.revokeObjectURL(u); P.urls.length = 0; }

  /* ---------------------------------------------------------------- the preview (a modal) */
  function pickerHtml(po, pickId, locked) {                                          // the story's pictures to choose from; locked while Mum and Dad have the request
    const media = po.media || []; if (media.length < 2) return '';
    const cur = picOf(po, pickId);
    return `<div class="pc-pick"${locked ? ' data-locked="1"' : ''}>${media.map((m) => `<button type="button" class="${cur && cur.id === m.id ? 'on' : ''}" data-pick="${esc(m.id)}" aria-label="Use this picture"><img class="${m.k === 'drawing' ? 'dr' : 'ph'}" data-oid="${esc(m.k === 'drawing' ? m.id : m.id + 't')}" data-kind="${m.k === 'drawing' ? 'drawing' : 'thumb'}" alt=""></button>`).join('')}</div><div class="tiny muted">${locked ? 'The picture they chose.' : 'Tap the picture to put on the card.'}</div>`;
  }
  async function openPreview(id) {
    if (Quests.isGrandDevice()) return;                                               // Grandma and Grandpa never send cards or ask Mum and Dad (3 Nov 2026)
    const po = Journal.post(id); if (!po) return;
    releaseUrls();
    openModal(`<h2 class="h2">📮 Postcard</h2><div class="pc-preview" id="pc-preview"><p class="muted">Drawing the postcard…</p></div>`);
    const st0 = Quests.cardStatus(id);
    let pickId = P.pick[id] || st0.pic || null, file = null, url = null, drawing = 0;
    const draw = async () => {                                                       // (re)draw for the current pick; the newest tap wins
      const my = ++drawing;
      let f = null;
      try { f = await prepare(id, pickId); } catch (e) { const el = $('#pc-preview'); if (el && my === drawing) el.innerHTML = `<div class="card red">${esc((e && e.message) || 'Could not draw the postcard.')}</div>`; return false; }
      if (my !== drawing || !f) return false;
      file = f; url = URL.createObjectURL(file); P.urls.push(url);
      return true;
    };
    if (!(await draw())) return;
    const el = $('#pc-preview'); if (!el) return;                                     // the modal closed meanwhile
    const st = Quests.cardStatus(id), parent = Quests.isParentDevice(), info = shareInfo(file);
    el.innerHTML = `<img id="pc-img" src="${url}" alt="Postcard">${pickerHtml(po, pickId, !parent && st.pending)}<div class="small muted pc-words">${esc(po.text || '')}</div><div id="pc-actions"></div>`;
    el.querySelectorAll('img[data-oid]').forEach((img) => Media.url(img.dataset.oid, img.dataset.kind).then((u) => { if (u) img.src = u; }));
    const mailto = () => `mailto:?subject=${encodeURIComponent('Postcard from ' + Quests.label(po.p))}&body=${encodeURIComponent(words(po))}`;
    const extra = `${st.sent ? ' Sent before; sending again is fine.' : ''}${st.rejected && !parent ? ' Last time they said not this time; you can ask again.' : ''}`;
    const actions = (why) => {                                                       // why: the NoShare error after a Share that the sheet refused, else null
      const box = $('#pc-actions'); if (!box) return;
      const can = !why && canShareFile(file);
      let html = '<div class="row">';
      if (parent) html += can ? `<button class="btn primary" id="pc-share">📤 Share</button>` : `<a class="btn primary" href="${url}" download="${esc(file.name)}">⬇️ Save the picture</a><a class="btn" href="${mailto()}">✉️ Email the words</a>`;
      else html += st.sent ? `<span class="chip">✓ Sent</span>` : st.pending ? `<span class="chip">⏳ Mum and Dad have it</span>` : `<button class="btn primary" id="pc-ask">📮 Ask Mum and Dad to send it</button>`;
      html += `<button class="btn" id="pc-copy">📋 Copy the words</button></div>`;
      const fallback = `${why ? why.message : noShare(info).message} Chrome on Android and Safari on iPhone usually share it in one tap.`;
      html += `<p class="tiny muted">${parent ? (can ? 'Share opens Mail or WhatsApp with the postcard attached: pick the grandparents and send.' : esc(fallback)) : 'Mum or Dad send it from their phone when they say yes.'}${extra}</p>`;
      box.innerHTML = html;
      const sh = $('#pc-share');
      if (sh) sh.onclick = async () => { sh.disabled = true; try { await share(file, po); Quests.approveCard(id); closeModal(); } catch (e) { sh.disabled = false; if (e && e.name === 'NoShare') actions(e); else if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not share.'); } };
      const ask = $('#pc-ask'); if (ask) ask.onclick = () => { Quests.requestCard(id, pickId); closeModal(); };
      const cp = $('#pc-copy'); if (cp) cp.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(words(po)).then(() => { cp.textContent = '✓ Copied'; }, () => {}); };
    };
    actions(null);
    const strip = el.querySelector('.pc-pick');
    if (strip && !strip.dataset.locked) strip.querySelectorAll('[data-pick]').forEach((b) => b.onclick = async () => {
      if (b.classList.contains('on')) return;
      strip.querySelectorAll('[data-pick]').forEach((o) => o.classList.toggle('on', o === b));
      pickId = b.dataset.pick; P.pick[id] = pickId;
      const im = $('#pc-img'); if (im) im.style.opacity = '0.4';
      if (await draw()) { const i2 = $('#pc-img'); if (i2) { i2.src = url; i2.style.opacity = ''; } actions(null); }
    });
  }
  /* the parent's ✓ on a waiting postcard: share from this phone, then mark it sent and tick the quest for the author */
  async function sendApproved(key) {
    const id = String(key || '').replace(/^card\|/, ''), po = Journal.post(id);
    if (!po) { alert('That story is gone.'); return false; }
    let file = null;
    try { file = await prepare(id, Quests.cardStatus(id).pic || null); } catch (e) { alert((e && e.message) || 'Could not draw the postcard.'); return false; }
    if (!file) return false;
    try { await share(file, po); Quests.approveCard(id); return true; }
    catch (e) { if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not share.'); return false; }
  }

  return { render, prepare, cardUrl, picOf, words, share, openPreview, sendApproved, firstLine, canShareFile, shareInfo, diag, releaseUrls, lookOf };
})();
