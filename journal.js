/* World Adventure journal (1 Nov 2026): a page a day per player (a mood, one line against a question of the day, a
   photo, a drawing), the family's story day by day, and the morning photos for the lost-kid card.
   A page is facts `page|<player>|<date>|<field>` (field: mood, text, q, photo, draw), each sealed with the media key,
   one fact per field so the iPad and a phone never overwrite each other's edits. Photos and drawings are Media
   objects, indexed by sealed `media|<id>` facts. Both ride the ordinary facts sync and survive "Reset all quest
   progress". Loaded after quests.js and before app.js; it uses app.js helpers ($, esc, fmtDate, currentContext,
   show, renderHome, dayOf, wireGo) at call time only. Nothing here names the 5 January plan. */
'use strict';
window.Journal = (() => {
  const MOODS = [['amazing', '🤩', 'Amazing'], ['good', '😊', 'Good'], ['ok', '😐', 'OK'], ['tired', '😴', 'Tired'], ['sad', '😢', 'Sad']];
  const MOOD = Object.fromEntries(MOODS.map((m) => [m[0], m]));
  const COLOURS = ['#1B1B2F', '#E63946', '#FF7A00', '#FFB703', '#2A9D8F', '#3A86FF', '#7B2CBF', '#FF4D8D'];
  const SIZES = [6, 14, 28];
  const J = { pages: {}, media: {}, cache: {}, warmed: false, warming: null, again: false, sel: null, observer: null, saveTimer: null, viewer: null, overlay: null };

  function init() {
    Quests.onFacts(() => { warm(); });
    Media.onChange(() => { const el = $('#sync-line'); if (el) el.textContent = Quests.syncText(); });
    Media.countPending().then(() => warm());
  }

  /* ---------------------------------------------------------------- the decrypted view of the facts (refreshed on every facts change) */
  const pkey = (p, d) => p + '|' + d;
  async function openCached(k, f) {
    const c = J.cache[k];
    if (c && c.t === f.t) return c.v;
    const v = await Media.open(f.v, k);
    J.cache[k] = { t: f.t, v };
    return v;
  }
  function guarded(el, title, fn) {   // a render that hits a problem says so on the screen instead of leaving it blank
    try { return fn(); }
    catch (e) {
      const msg = (e && e.message) || String(e), where = String((e && e.stack) || '').split('\n').slice(0, 2).join(' · ').slice(0, 200);
      if (window.logErr) logErr(title + ': ' + msg + ' ' + where);
      if (el) el.innerHTML = `<h1 class="h1">${title}</h1><div class="card red"><b>This screen hit a problem.</b><div class="small">${esc(msg)}</div><div class="tiny mono">${esc(where)}</div><div class="small" style="margin-top:8px">Tell Andy what it says, then try Settings → Sync now.</div></div>`;
      return null;
    }
  }
  function diag() { return `warmed ${J.warmed} · ${J.error ? 'error ' + J.error : 'ok'} · pages ${Object.keys(J.pages).length} · pictures ${Object.keys(J.media).length}`; }
  function warm() {
    if (J.warming) { J.again = true; return J.warming; }
    J.warming = (async () => {
      try {
        if (!Media.enabled) { J.warmed = true; return; }
        const pf = Quests.factsByPrefix('page|'), mf = Quests.factsByPrefix('media|');
        const pages = {}, media = {};
        await Promise.all(Object.entries(pf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v) return;
          const parts = k.split('|'), pk = pkey(parts[1], parts[2]);
          (pages[pk] = pages[pk] || {})[parts[3]] = v.v;
        }));
        await Promise.all(Object.entries(mf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v || !v.on) return;
          const id = k.slice(6); media[id] = Object.assign({ id }, v);
        }));
        for (const r of await Media.pendingList()) if (!media[r.id]) media[r.id] = { id: r.id, k: r.k, p: r.p, d: r.d, tag: r.tag || '', n: r.n, w: r.w, h: r.h, t: r.at, local: true };
        J.pages = pages; J.media = media; J.warmed = true; J.error = null;
        prefetchMorning();
        if (S.screen === 'home') renderHome();
        if (S.screen === 'story') renderStory();
      } catch (e) {
        J.error = (e && e.message) || String(e); J.warmed = true;              // show the screens with the error, not "Opening…" forever
        if (window.logErr) logErr('journal warm: ' + J.error);
        if (S.screen === 'story') renderStory();
      } finally { J.warming = null; if (J.again) { J.again = false; warm(); } }
    })();
    return J.warming;
  }
  function page(p, d) { return J.pages[pkey(p, d)] || {}; }
  async function setField(p, d, field, value) {
    const key = `page|${p}|${d}|${field}`;
    (J.pages[pkey(p, d)] = J.pages[pkey(p, d)] || {})[field] = value;     // at once; warm() confirms after the fact lands
    Quests.setFact(key, await Media.seal({ v: value }, key));
  }
  function index() { return Object.values(J.media); }
  function mediaOn(date, pred) { return index().filter((m) => m.d === date && (!pred || pred(m))).sort((a, b) => (a.t || 0) - (b.t || 0)); }
  const avatarOf = (p) => Quests.view(Quests.state(), p).avatar;
  const moodOf = (p, d) => { const m = MOOD[page(p, d).mood]; return m ? m[1] : ''; };
  function cityOf(date, ctx) {
    ctx = ctx || currentContext();
    if (date === ctx.date) return ctx.before ? 'Home' : (ctx.inAir ? 'Air' : ctx.city);
    const d = dayOf(date);
    return d ? Quests.dayCity(d) : (date < S.family.trip.start ? 'Home' : 'Townsville');
  }
  /* the question of the day: the city's list first (by how many days we have been there), then the general list; the same on every device */
  function promptFor(city, date) {
    const P = (S.family.journal || {}).prompts || {}, key = Quests.CITY_KEY[city] || 'any';
    const own = P[key] || [], any = P.any || [];
    if (!own.length && !any.length) return { id: 'default', q: 'What was the best bit of today?' };
    const nth = S.family.days.filter((d) => d.date < date && Quests.dayCity(d) === city).length;
    const pick = nth < own.length ? own[nth] : any[(nth - own.length + Math.abs(Quests.daysBetween(S.family.trip.start, date))) % Math.max(1, any.length)];
    return { id: String(pick.id || key + nth), q: String(pick.q || pick) };
  }
  function stickersFor(pl, d, ctx) {
    const out = pl.items.filter((it) => it.counted && it.date === d).map((it) => ({ e: it.e, t: it.title }));
    for (const b of Quests.badges(pl, ctx)) if (b.earned && (b.opens === d || b.on === d)) out.push({ e: b.e, t: b.t });
    return out;
  }
  function prefetchMorning() {           // parent phones: today's morning photos at full size, so the lost-kid card works offline
    if (!Quests.isParentDevice()) return;
    const today = currentContext().date;
    for (const m of mediaOn(today, (m) => m.k === 'photo' && m.tag === 'morning' && !m.local)) Media.ensure(m.id, 'photo');
  }

  /* ---------------------------------------------------------------- Home tile and the lost-kid strip */
  function todayTileHtml(ctx) {
    try { return todayTileInner(ctx); }
    catch (e) { if (window.logErr) logErr('today tile: ' + ((e && e.message) || e)); return `<div class="tile wide t3"><span class="ico">📓</span><span class="tt">Today's page</span><span class="ts">hit a problem: ${esc((e && e.message) || e)}</span></div>`; }
  }
  function todayTileInner(ctx) {
    if (!Media.enabled) return '';
    const who = Quests.visiblePlayers().map((p) => { const pg = page(p, ctx.date), has = pg.mood || pg.text || pg.photo || pg.draw; return `${avatarOf(p)} ${esc(Quests.label(p))} ${has ? (MOOD[pg.mood] ? MOOD[pg.mood][1] : '✓') : '–'}`; }).join(' · ');
    const n = mediaOn(ctx.date, (m) => m.k === 'photo').length;
    return `<button class="tile ht wide t5" data-page="1"><span class="ico">📓</span><span class="tt">Today's page</span><span class="ts">${who}</span><span class="ts small">${n ? `${n} photo${n === 1 ? '' : 's'} today · ` : ''}A mood, one line, a photo, a drawing</span></button>`;
  }
  function morningHtml(date) {
    if (!Media.enabled) return '';
    const ms = mediaOn(date, (m) => m.k === 'photo' && m.tag === 'morning');
    if (!ms.length) return `<div class="card red"><b>This morning's photo</b>: none in the app yet. Open Photos and have it ready to show.</div>`;
    return `<div class="card"><div class="h3">This morning's photos</div><div class="morning-strip">${ms.map((m) => `<button data-view="${esc(m.id)}" data-group="${esc(date)}"><img class="ph" data-oid="${esc(m.id)}t" data-kind="thumb" alt="${esc(Quests.label(m.p))}"></button>`).join('')}</div><div class="tiny muted">Tap one for full size.</div></div>`;
  }
  function fillMedia(root) { root.querySelectorAll('img[data-oid]').forEach((img) => { if (!img.src) Media.url(img.dataset.oid, img.dataset.kind).then((u) => { if (u) img.src = u; else img.classList.add('missing'); }); }); }
  function wireViews(root) {
    root.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => {
      const group = b.dataset.group;
      const ids = group ? mediaOn(group, (m) => m.k === 'photo').map((m) => m.id) : [b.dataset.view];
      if (!ids.includes(b.dataset.view)) ids.unshift(b.dataset.view);
      openViewer(ids, Math.max(0, ids.indexOf(b.dataset.view)));
    });
  }
  function fill(root) { fillMedia(root); wireViews(root); }

  /* ---------------------------------------------------------------- photos in */
  async function addPhoto(p, d, tag, camera) {       // Media.pick runs synchronously up to the input click: keep this first
    const meta = { p, d, tag, id: Media.newId() };
    const files = await Media.pick({ camera, keep: camera ? (f) => Media.keepOriginal(f, meta) : null });   // Snap: the full-size original too
    if (!files.length) return null;
    try {
      const r = await Media.addImage(files[0], meta);
      J.media[r.id] = { id: r.id, k: 'photo', p, d, tag, n: r.n, w: r.w, h: r.h, t: Date.now(), local: true };
      return r.id;
    } catch (e) { alert(e.message || 'That photo could not be saved.'); return null; }
  }

  /* ---------------------------------------------------------------- the page screen */
  function openPage(p, d) { J.sel = { p, d }; show('page'); }
  function renderPage() { return guarded($('#screen-page'), "📓 Today's page", renderPageInner); }
  function renderPageInner() {
    const el = $('#screen-page'), ctx = currentContext(), st = Quests.state();
    if (!Media.enabled) { el.innerHTML = `<h1 class="h1">📓 Today's page</h1><div class="card">Pages and photos need a full rebuild of the app: this build has no media key.</div>`; return; }
    const sel = J.sel && J.sel.d <= ctx.date ? J.sel : { p: st.active, d: ctx.date };
    if (!Quests.visiblePlayers().includes(sel.p)) sel.p = st.active;
    J.sel = sel;
    const p = sel.p, d = sel.d, pg = page(p, d), city = cityOf(d, ctx), prompt = promptFor(city, d), pl = Quests.view(st, p);
    const diaryDone = (pl.done.diary || []).includes(d), diaryPending = pl.pending.some((it) => it.id === 'diary' && it.date === d);
    const photo = pg.photo ? (J.media[pg.photo] || { id: pg.photo, k: 'photo' }) : null, draw = pg.draw ? (J.media[pg.draw] || { id: pg.draw, k: 'drawing' }) : null;   // the index may lag a fresh capture by a moment
    let html = `<h1 class="h1">📓 ${esc(Quests.label(p))}'s page</h1>`;
    html += `<div class="players">` + Quests.visiblePlayers().map((q) => `<button class="player${q === p ? ' active' : ''}" data-pl="${esc(q)}"><span class="av">${avatarOf(q)}</span><span class="nm">${esc(Quests.label(q))}</span><span class="pt">${moodOf(q, d) || '–'}</span></button>`).join('') + `</div>`;
    html += `<div class="pagehead"><span class="se">${Quests.CITY_EMOJI[city] || '📍'}</span><div><b>${esc(fmtDate(d))}</b>${d !== ctx.date ? ' <span class="chip">earlier day</span>' : ''}<div class="small muted">${esc(city === 'Home' ? 'At home' : city === 'Air' ? 'In the air' : city)}</div></div></div>`;
    html += `<div class="card"><div class="h3">How was today?</div><div class="moods">` + MOODS.map(([id, e, t]) => `<button class="mood${pg.mood === id ? ' on' : ''}" data-mood="${id}"><span class="me">${e}</span><span class="mt">${t}</span></button>`).join('') + `</div></div>`;
    html += `<div class="card"><div class="page-q">${esc(pg.q || prompt.q)}</div><textarea class="page-text" id="page-text" maxlength="300" rows="3" enterkeyhint="done" placeholder="Write or say one line…">${esc(pg.text || '')}</textarea><div class="tiny muted" id="page-saved">${pg.text ? 'Saved ✓' : 'Saves by itself'}</div></div>`;
    html += `<div class="card"><div class="h3">Picture of the day</div><div class="page-media">${photo ? `<button class="phbtn" data-view="${esc(photo.id)}"><img class="ph" data-oid="${esc(photo.id)}t" data-kind="thumb" alt="Photo"></button>` : ''}${draw ? `<button class="phbtn" data-view="${esc(draw.id)}"><img class="dr" data-oid="${esc(draw.id)}" data-kind="drawing" alt="Drawing"></button>` : ''}</div><div class="row"><button class="btn" data-snap="camera">📷 Snap</button><button class="btn" data-snap="library">🖼️ Add a photo</button><button class="btn" id="page-draw">🖍️ Draw</button></div>${Media.origHint() ? `<p class="tiny muted">${esc(Media.origHint())}</p>` : ''}</div>`;
    const stickers = stickersFor(pl, d, ctx);
    if (stickers.length) html += `<div class="card"><div class="h3">Stickers from this day</div><div class="stickers">${stickers.map((s) => `<span class="sticker">${s.e} ${esc(s.t)}</span>`).join('')}</div></div>`;
    html += diaryDone ? `<div class="card" style="border-color:var(--city)"><b>✓ Page done for ${esc(fmtDate(d))}</b> · +5 points</div>`
      : diaryPending ? `<div class="card"><b>⏳ Sent to Mum and Dad</b> · 5 points when they say yes</div>`
      : `<button class="btn primary block" id="page-done">✓ Done for today · 5 pts</button>`;
    html += `<div class="row"><button class="btn" data-go="story">📖 Our story</button></div>`;
    el.innerHTML = html;
    wirePage(el, p, d, prompt);
    fill(el);
  }
  function wirePage(el, p, d, prompt) {
    el.querySelectorAll('[data-pl]').forEach((b) => b.onclick = () => { Quests.setActive(b.dataset.pl); J.sel = { p: b.dataset.pl, d }; renderPage(); });
    el.querySelectorAll('[data-mood]').forEach((b) => b.onclick = () => { FX.haptic(15); setField(p, d, 'mood', b.dataset.mood); el.querySelectorAll('.mood').forEach((x) => x.classList.toggle('on', x === b)); FX.pulse(b, 'bump', 600); el.querySelector(`[data-pl="${CSS.escape(p)}"] .pt`).textContent = MOOD[b.dataset.mood][1]; });
    const ta = el.querySelector('#page-text'), saved = el.querySelector('#page-saved');
    const saveText = async () => {
      const v = ta.value.trim().slice(0, 300);
      if (v === (page(p, d).text || '')) { saved.textContent = v ? 'Saved ✓' : 'Saves by itself'; return; }
      await setField(p, d, 'text', v);
      if (v && !page(p, d).q) await setField(p, d, 'q', prompt.q);
      saved.textContent = 'Saved ✓';
    };
    ta.oninput = () => { saved.textContent = '…'; clearTimeout(J.saveTimer); J.saveTimer = setTimeout(saveText, 1500); };
    ta.onblur = () => { clearTimeout(J.saveTimer); saveText(); };
    ta.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.blur(); } };
    el.querySelectorAll('[data-snap]').forEach((b) => b.onclick = () => addPhoto(p, d, 'page', b.dataset.snap === 'camera').then((id) => { if (id) setField(p, d, 'photo', id).then(renderPage); }));
    el.querySelector('#page-draw').onclick = () => openDraw(p, d);
    const done = el.querySelector('#page-done');
    if (done) done.onclick = () => { done.disabled = true; clearTimeout(J.saveTimer); saveText().then(() => { Quests.complete(p, 'diary', d); renderPage(); }); };
    wireGo(el);
  }

  /* ---------------------------------------------------------------- the drawing pad (its own full-screen overlay) */
  function openDraw(p, d) {
    const ov = $('#overlay');
    if (typeof Nav !== 'undefined') Nav.pushOverlay();
    ov.innerHTML = `<div class="pad-bar">${COLOURS.map((c, i) => `<button class="dot${i === 0 ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour"></button>`).join('')}<button class="dot eraser" data-c="#ffffff" style="background:#fff" aria-label="Eraser">🧽</button>${SIZES.map((s, i) => `<button class="sz${i === 1 ? ' on' : ''}" data-s="${s}" aria-label="Brush size"><i style="width:${8 + i * 8}px;height:${8 + i * 8}px"></i></button>`).join('')}</div><div class="pad-wrap"><canvas id="pad"></canvas></div><div class="pad-foot"><button id="pad-cancel" aria-label="Cancel">✕</button><button id="pad-undo" aria-label="Undo">↶ <span class="lbl">Undo</span></button><button id="pad-clear" aria-label="Clear">🗑️</button><button class="done" id="pad-done">✓ Done</button></div>`;
    ov.classList.remove('hidden');
    const cv = ov.querySelector('#pad'), wrap = ov.querySelector('.pad-wrap'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, wrap.clientWidth), H = Math.max(1, wrap.clientHeight);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    const strokes = []; let cur = null, colour = COLOURS[0], size = SIZES[1];
    const stroke = (s) => { g.strokeStyle = s.c; g.lineWidth = s.w; g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); g.stroke(); };
    const paint = () => { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); for (const s of strokes) stroke(s); };
    paint();
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.onpointerdown = (e) => { if (e.button) return; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* a stroke still draws without capture */ } cur = { c: colour, w: size, pts: [pos(e)] }; strokes.push(cur); stroke(cur); };
    cv.onpointermove = (e) => { if (!cur) return; const [x, y] = pos(e), last = cur.pts[cur.pts.length - 1]; cur.pts.push([x, y]); g.strokeStyle = cur.c; g.lineWidth = cur.w; g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(x, y); g.stroke(); };
    cv.onpointerup = cv.onpointercancel = () => { cur = null; };
    ov.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { colour = b.dataset.c; ov.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); });
    ov.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { size = +b.dataset.s; ov.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b)); });
    ov.querySelector('#pad-undo').onclick = () => { strokes.pop(); paint(); };
    ov.querySelector('#pad-clear').onclick = () => { if (!strokes.length || confirm('Clear the drawing?')) { strokes.length = 0; paint(); } };
    const close = () => { ov.classList.add('hidden'); ov.innerHTML = ''; J.overlay = null; };
    const cancel = () => { if (strokes.length && !confirm('Leave without saving the drawing?')) return false; close(); return true; };
    J.overlay = { back: cancel };
    ov.querySelector('#pad-cancel').onclick = cancel;
    ov.querySelector('#pad-done').onclick = async (e) => {
      if (!strokes.length) return close();
      e.target.disabled = true;
      try {
        const r = await Media.addCanvas(cv, { p, d, tag: 'page' });
        J.media[r.id] = { id: r.id, k: 'drawing', p, d, tag: 'page', n: r.n, w: r.w, h: r.h, t: Date.now(), local: true };
        await setField(p, d, 'draw', r.id);
        close();
        Quests.celebrate('🖍️', 'Masterpiece!', 'Saved to your page', p, 'quest');
        if (S.screen === 'page') renderPage();
      } catch (err) { alert(err.message || 'Could not save the drawing.'); e.target.disabled = false; }
    };
  }

  /* ---------------------------------------------------------------- the viewer (same overlay) */
  function openViewer(ids, i) {
    const ov = $('#overlay');
    J.viewer = { ids, i: i || 0 };
    ov.innerHTML = `<div class="viewer"><div class="viewer-img" id="viewer-img"><img alt=""></div><div class="viewer-bar"><button id="v-prev" aria-label="Previous">‹</button><div class="vi" id="v-info"></div><button id="v-next" aria-label="Next">›</button>${Quests.isParentDevice() ? `<button class="del" id="v-del" aria-label="Delete">🗑️</button>` : ''}<button id="v-close" aria-label="Close">✕</button></div></div>`;
    ov.classList.remove('hidden');
    if (typeof Nav !== 'undefined') Nav.pushOverlay();
    const img = ov.querySelector('img'), info = ov.querySelector('#v-info');
    const closeViewer = () => { ov.classList.add('hidden'); ov.innerHTML = ''; J.viewer = null; J.overlay = null; };
    J.overlay = { back: () => { closeViewer(); return true; } };
    const showAt = async (k) => {
      if (!J.viewer) return;
      J.viewer.i = (k + ids.length) % ids.length;
      const m = J.media[ids[J.viewer.i]];
      img.removeAttribute('src');
      if (!m) { info.textContent = 'That picture is gone.'; return; }
      info.textContent = `${Quests.label(m.p)} · ${fmtDate(m.d)}${m.tag === 'morning' ? ' · morning photo' : m.k === 'drawing' ? ' · drawing' : ''}${m.local ? ' · not backed up yet' : ''}${ids.length > 1 ? ` · ${J.viewer.i + 1} of ${ids.length}` : ''}`;
      const u = await Media.url(m.id, m.k === 'drawing' ? 'drawing' : 'photo');
      if (!J.viewer || J.media[ids[J.viewer.i]] !== m) return;
      if (u) img.src = u; else info.textContent += ' · not downloaded yet (needs internet)';
    };
    ov.querySelector('#v-prev').onclick = () => showAt(J.viewer.i - 1);
    ov.querySelector('#v-next').onclick = () => showAt(J.viewer.i + 1);
    ov.querySelector('#v-close').onclick = closeViewer;
    const del = ov.querySelector('#v-del');
    if (del) del.onclick = async () => {
      const m = J.media[ids[J.viewer.i]];
      if (!m || !confirm('Delete this picture for everyone?')) return;
      await deleteMedia(m.id);
      closeViewer();
      if (S.screen === 'story') renderStory();
      if (S.screen === 'page') renderPage();
      if (S.screen === 'home') renderHome();
    };
    let sx = null; const vi = ov.querySelector('#viewer-img');
    vi.onpointerdown = (e) => { sx = e.clientX; };
    vi.onpointerup = (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40 && ids.length > 1) showAt(J.viewer.i + (dx < 0 ? 1 : -1)); };
    showAt(J.viewer.i);
  }
  async function deleteMedia(id) {
    const key = 'media|' + id;
    Quests.setFact(key, await Media.seal({ on: false }, key));
    await Media.remove(id);
    delete J.media[id];
  }

  /* ---------------------------------------------------------------- Our story: every day, newest first */
  function renderStory() { return guarded($('#screen-story'), '📖 Our story', renderStoryInner); }
  function renderStoryInner() {
    const el = $('#screen-story'), ctx = currentContext(), F = S.family, st = Quests.state();
    if (!Media.enabled) { el.innerHTML = `<h1 class="h1">📖 Our story</h1><div class="card">Pages and photos need a full rebuild of the app: this build has no media key.</div>`; return; }
    if (!J.warmed) { el.innerHTML = `<h1 class="h1">📖 Our story</h1><p class="muted">Opening the pages…</p>`; warm(); return; }
    const players = Quests.visiblePlayers(), dates = new Set();
    for (let d = F.trip.start; d <= ctx.date && d <= F.trip.end; d = Quests.addDays(d, 1)) dates.add(d);
    for (const k of Object.keys(J.pages)) dates.add(k.split('|')[1]);
    for (const m of index()) if (m.d) dates.add(m.d);
    const badgeDates = {};
    for (const b of Quests.badges(Quests.view(st, st.active), ctx)) { const on = b.opens || b.on; if (b.earned && on && (b.kind === 'stamp' || b.kind === 'milestone')) (badgeDates[on] = badgeDates[on] || []).push(b); }
    let html = `<h1 class="h1">📖 Our story</h1>`, any = false;
    if (J.error) html += `<div class="card red"><b>Could not open the pages.</b><div class="small">${esc(J.error)}</div><div class="small">Tell Andy what it says, then try Settings → Sync now.</div></div>`;
    const o = Media.originalsSummary();
    if (Media.canSaveOriginals() && o.waiting) {
      html += `<div class="card originals"><b>📥 ${o.waiting} full-size photo${o.waiting === 1 ? '' : 's'} not yet in Photos</b> <span class="muted small">(${(o.waitingBytes / 1048576).toFixed(1)} MB)</span><div class="row"><button class="btn" id="orig-save">Save to Photos</button></div><div class="tiny muted">One tap saves up to ${Media.LIMITS.shareBatch} at a time. Then Photos has the originals and the app keeps the small copies.</div></div>`;
      Media.prepareOriginals();
    }
    for (const date of [...dates].sort().reverse()) {
      const day = dayOf(date), city = cityOf(date, ctx), key = Quests.CITY_KEY[city] || 'home';
      const photos = mediaOn(date, (m) => m.k === 'photo');
      const pages = players.map((p) => [p, page(p, date)]).filter(([, pg]) => pg.mood || pg.text || pg.photo || pg.draw);
      const moves = (F.moves || []).filter((m) => m.date === date), stamps = badgeDates[date] || [];
      const empty = !photos.length && !pages.length;
      if (!empty) any = true;
      html += `<div class="card story-day${empty ? ' story-empty' : ''}" style="--city:var(--c-${key})"><div class="story-head"><span class="se">${Quests.CITY_EMOJI[city] || '📍'}</span><div><b>${esc(fmtDate(date))}</b>${date === ctx.date ? '<span class="chip red">today</span>' : ''}<div class="small muted">${esc(day ? day.where : (city === 'Home' ? 'At home' : city))}</div></div></div>`;
      if (moves.length) html += moves.map((m) => `<div class="small">${/train/i.test(m.mode || '') ? '🚆' : /coach|bus/i.test(m.mode || '') ? '🚌' : '✈️'} ${esc(m.frm)} → ${esc(m.to)} · ${esc(m.depart)}</div>`).join('');
      if (stamps.length) html += `<div class="stickers">${stamps.map((b) => `<span class="sticker">${b.e} ${esc(b.t)}</span>`).join('')}</div>`;
      if (photos.length) html += `<div class="story-grid">${photos.map((m) => `<button data-view="${esc(m.id)}" data-group="${esc(date)}"><img class="ph" data-oid="${esc(m.id)}t" data-kind="thumb" alt=""></button>`).join('')}</div>`;
      for (const [p, pg] of pages) {
        const dr = pg.draw && J.media[pg.draw];
        html += `<div class="story-page"><span class="av">${avatarOf(p)}</span><div class="pt"><b>${esc(Quests.label(p))}</b> ${MOOD[pg.mood] ? MOOD[pg.mood][1] : ''}${pg.q && pg.text ? `<div class="tiny muted">${esc(pg.q)}</div>` : ''}${pg.text ? `<div>${esc(pg.text)}</div>` : ''}${dr ? `<button class="phbtn" data-view="${esc(dr.id)}"><img class="dr" data-oid="${esc(dr.id)}" data-kind="drawing" alt="Drawing"></button>` : ''}</div></div>`;
      }
      html += `<div class="row">${players.map((p) => `<button class="btn small-btn" data-write="${esc(p)}|${esc(date)}">✏️ ${esc(Quests.label(p))}</button>`).join('')}<button class="btn small-btn" data-addphoto="${esc(date)}">🖼️ Add a photo</button></div></div>`;
    }
    if (!any) html += `<p class="small muted">Nothing written yet. Today's page is on the Home screen.</p>`;
    el.innerHTML = html;
    wireViews(el);
    el.querySelectorAll('[data-write]').forEach((b) => b.onclick = () => { const [p, d] = b.dataset.write.split('|'); Quests.setActive(p); openPage(p, d); });
    el.querySelectorAll('[data-addphoto]').forEach((b) => b.onclick = () => addPhoto(st.active, b.dataset.addphoto, 'day', false).then((id) => { if (id) renderStory(); }));
    const os = el.querySelector('#orig-save');
    if (os) os.onclick = () => { os.disabled = true; Media.saveOriginals().then((r) => { if (r.saved) Quests.celebrate('📥', `Saved ${r.saved} to Photos`, r.left ? `${r.left} more to go: tap again` : 'All your full-size photos are in Photos', st.active, 'ok'); renderStory(); }).catch((e) => { os.disabled = false; if (e && e.name !== 'AbortError') alert(e.message || 'Could not hand the photos over.'); }); };
    observe(el);
  }
  function observe(root) {               // thumbnails decrypt only near the viewport and let go again when far away
    if (J.observer) J.observer.disconnect();
    J.observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const img = en.target;
        if (en.isIntersecting) { if (!img.src) Media.url(img.dataset.oid, img.dataset.kind).then((u) => { if (u) img.src = u; else img.classList.add('missing'); }); }
        else if (img.src) img.removeAttribute('src');
      }
    }, { rootMargin: '600px 0px' });
    root.querySelectorAll('img[data-oid]').forEach((img, i) => {
      if (i < 12) Media.url(img.dataset.oid, img.dataset.kind).then((u) => { if (u && !img.src) img.src = u; });   // the first screenful at once; the observer handles the rest
      J.observer.observe(img);
    });
  }
  function onLeave(screen) {
    if (screen !== 'story' && screen !== 'page') return;
    if (J.observer) { J.observer.disconnect(); J.observer = null; }
    if (screen === 'page') { clearTimeout(J.saveTimer); const ta = $('#page-text'); if (ta && ta.onblur) ta.onblur(); }
    Media.release();
  }
  async function downloadAll(onProgress) {
    const ms = index(), total = ms.length * 2; let done = 0;
    for (const m of ms) {
      if (m.k === 'photo') await Media.ensure(m.id + 't', 'thumb');
      await Media.ensure(m.id, m.k === 'drawing' ? 'drawing' : 'photo');
      done += 2; if (onProgress) onProgress(Math.min(done, total), total);
    }
  }

  return { init, warm, page, setField, promptFor, index, todayTileHtml, morningHtml, fill, renderPage, renderStory, openPage, openDraw, openViewer, onLeave, addPhoto, downloadAll, MOODS,
    overlayOpen: () => !!J.overlay, overlayBack: () => (J.overlay ? J.overlay.back() : true), diag };
})();
