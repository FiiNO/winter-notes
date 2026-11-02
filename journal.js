/* World Adventure stories (journal.js; the Stories tab, 1 Nov 2026 evening): the family's feed. Anyone posts a story any
   time (text with emoji, a mood, the question of the day, up to six photos or drawings), replies to one (text, emoji,
   one picture) or taps a quick emoji on it. Also the morning photos for the lost-kid card.
   A post is one sealed fact `post|<id>` {on,p,d,t,text,mood,q,media:[{id,k}]}; a reply is `cmt|<postId>|<id>`
   {on,p,t,text,media}; a reply that is only emoji shows as a reaction. The pages written before this (facts
   `page|<p>|<date>|<field>`) show as read-only posts. Pictures are Media objects indexed by sealed `media|<id>` facts.
   Everything rides the ordinary facts sync and survives "Reset all quest progress". Nothing on a kids' device waits
   for a parent. Loaded after quests.js and before app.js; it uses app.js helpers ($, esc, fmtDate, tzOf,
   currentContext, show, renderHome, dayOf, wireGo, Nav, logErr) at call time only. Nothing here names the 5 January plan. */
'use strict';
window.Journal = (() => {
  const MOODS = [['amazing', '🤩', 'Amazing'], ['good', '😊', 'Good'], ['ok', '😐', 'OK'], ['tired', '😴', 'Tired'], ['sad', '😢', 'Sad']];
  const MOOD = Object.fromEntries(MOODS.map((m) => [m[0], m]));
  const COLOURS = ['#1B1B2F', '#E63946', '#FF7A00', '#FFB703', '#2A9D8F', '#3A86FF', '#7B2CBF', '#FF4D8D'];
  const SIZES = [6, 14, 28];
  const EMOJI = ['😀', '😂', '🤩', '😍', '😎', '🥳', '😴', '🥶', '🤯', '😱', '😋', '🤔', '❤️', '🎉', '👍', '🙌', '🔥', '⭐', '🍣', '🍜', '🍕', '🍦', '🍩', '⛷️', '🏂', '⛄', '❄️', '🗼', '🗽', '🏒', '🚄', '✈️', '🐻', '🦌', '🦖'];
  const QUICK = ['❤️', '😂', '🤩', '👍', '🎉'];
  const MAX_TEXT = 500, MAX_MEDIA = 6;
  const J = { pages: {}, posts: {}, cmts: {}, media: {}, cache: {}, warmed: false, warming: null, again: false, observer: null, viewer: null, overlay: null, draft: null, dirty: false, vv: null, error: null };

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
  function diag() {
    let kb = 0; try { kb = Math.round((localStorage.getItem('quests:v2') || '').length / 1024); } catch (e) { /* blocked */ }
    const replies = Object.values(J.cmts).reduce((n, l) => n + l.length, 0);
    return `warmed ${J.warmed} · ${J.error ? 'error ' + J.error : 'ok'} · stories ${Object.keys(J.posts).length} · replies ${replies} · pictures ${Object.keys(J.media).length} · facts ${kb} KB`;
  }
  const composerOpen = () => !!(J.overlay && J.overlay.kind === 'composer');
  function warm() {
    if (J.warming) { J.again = true; return J.warming; }
    J.warming = (async () => {
      try {
        if (!Media.enabled) { J.warmed = true; return; }
        const pf = Quests.factsByPrefix('page|'), mf = Quests.factsByPrefix('media|'), sf = Quests.factsByPrefix('post|'), cf = Quests.factsByPrefix('cmt|');
        const pages = {}, media = {}, posts = {}, cmts = {};
        await Promise.all(Object.entries(pf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v) return;
          const parts = k.split('|'), pk = pkey(parts[1], parts[2]);
          (pages[pk] = pages[pk] || {})[parts[3]] = v.v;
        }));
        await Promise.all(Object.entries(mf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v || !v.on) return;
          const id = k.slice(6); media[id] = Object.assign({ id }, v);
        }));
        await Promise.all(Object.entries(sf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v || !v.on) return;
          const id = k.slice(5); posts[id] = Object.assign({ id, _t: f.t, _d: f.d || '' }, v);
        }));
        await Promise.all(Object.entries(cf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v || !v.on) return;
          const parts = k.split('|'); if (parts.length < 3) return;
          (cmts[parts[1]] = cmts[parts[1]] || []).push(Object.assign({ id: parts[2], postId: parts[1], _t: f.t, _d: f.d || '' }, v));
        }));
        for (const list of Object.values(cmts)) list.sort((a, b) => (a.t || 0) - (b.t || 0));
        // the pages written before the Stories tab: read-only posts, so nothing already written is lost
        for (const [pk, pg] of Object.entries(pages)) {
          if (!(pg.mood || pg.text || pg.photo || pg.draw)) continue;
          const [p, d] = pk.split('|'), id = 'pg-' + p + '-' + d, tf = pf[`page|${p}|${d}|text`] || pf[`page|${p}|${d}|mood`];
          const list = []; if (pg.photo) list.push({ id: pg.photo, k: 'photo' }); if (pg.draw) list.push({ id: pg.draw, k: 'drawing' });
          posts[id] = { id, p, d, t: (tf && tf.t) || Date.parse(d + 'T12:00:00Z'), text: pg.text || '', mood: pg.mood || '', q: pg.q || '', media: list, legacy: true, _t: 0, _d: '' };
        }
        for (const r of await Media.pendingList()) if (!media[r.id]) media[r.id] = { id: r.id, k: r.k, p: r.p, d: r.d, tag: r.tag || '', n: r.n, w: r.w, h: r.h, t: r.at, local: true };
        // a story can arrive before its pictures are uploaded: a stub lets the thumbnail and the viewer try to fetch them
        const stub = (m, p, d) => { if (m && m.id && !media[m.id]) media[m.id] = { id: m.id, k: m.k || 'photo', p, d, tag: 'story', stub: true }; };
        for (const po of Object.values(posts)) for (const m of po.media || []) stub(m, po.p, po.d);
        for (const list of Object.values(cmts)) for (const c of list) stub(c.media, c.p, posts[c.postId] ? posts[c.postId].d : '');
        J.pages = pages; J.media = media; J.posts = posts; J.cmts = cmts; J.warmed = true; J.error = null;
        prefetchMorning(); prefetchLatest(); refreshBadge();
        if (S.screen === 'home') renderHome();
        if (S.screen === 'story') { if (composerOpen()) J.dirty = true; else renderStory(); }
      } catch (e) {
        J.error = (e && e.message) || String(e); J.warmed = true;              // show the screens with the error, not "Opening…" forever
        if (window.logErr) logErr('journal warm: ' + J.error);
        if (S.screen === 'story' && !composerOpen()) renderStory();
      } finally { J.warming = null; if (J.again) { J.again = false; warm(); } }
    })();
    return J.warming;
  }
  function page(p, d) { return J.pages[pkey(p, d)] || {}; }
  function index() { return Object.values(J.media); }
  function mediaOn(date, pred) { return index().filter((m) => m.d === date && (!pred || pred(m))).sort((a, b) => (a.t || 0) - (b.t || 0)); }
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
  /* Grandma and Grandpa's phone (2 Nov 2026): the newest story day's pictures arrive on their own after a sync, so the latest
     stories open at once; older ones load on tap, or all of them with Settings → Download all pictures. */
  function prefetchLatest() {
    if (!Quests.isGrandDevice() || !navigator.onLine) return;
    const days = Object.values(J.posts).map((p) => p.d).filter(Boolean).sort(), last = days[days.length - 1];
    if (!last) return;
    const ms = index().filter((m) => m.d === last);
    (async () => { for (const m of ms) { try { if (m.k === 'photo') await Media.ensure(m.id + 't', 'thumb'); await Media.ensure(m.id, m.k === 'drawing' ? 'drawing' : 'photo'); } catch (e) { /* next sync */ } } })();
  }
  function prefetchMorning() {           // parent phones: today's morning photos at full size, so the lost-kid card works offline
    if (!Quests.isParentDevice()) return;
    const today = currentContext().date;
    for (const m of mediaOn(today, (m) => m.k === 'photo' && m.tag === 'morning' && !m.local)) Media.ensure(m.id, 'photo');
  }

  /* ---------------------------------------------------------------- stories and replies: reading */
  function post(id) { return J.posts[id] || null; }
  function postsOn(date) { return Object.values(J.posts).filter((po) => po.d === date).sort((a, b) => (a.t || 0) - (b.t || 0)); }
  function usedMediaIds() {
    const s = new Set();
    for (const po of Object.values(J.posts)) for (const m of po.media || []) s.add(m.id);
    for (const list of Object.values(J.cmts)) for (const c of list) if (c.media) s.add(c.media.id);
    return s;
  }
  function looseOn(date, used) { used = used || usedMediaIds(); return mediaOn(date, (m) => m.k === 'photo' && m.tag !== 'story' && !used.has(m.id)); }   // the morning photos and the like
  function isEmojiOnly(s) {
    s = String(s || '').trim();
    try { return !!s && /\p{Extended_Pictographic}/u.test(s) && /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(s); } catch (e) { return false; }
  }
  const canDelete = (x, st) => !x.legacy && (x._d === st.device || Quests.isParentDevice());
  function unseenCount(st) {             // stories and replies from another device since this device last looked at the feed
    const seen = +(localStorage.getItem('storiesSeen') || 0); let n = 0;
    for (const po of Object.values(J.posts)) if (!po.legacy && po._d !== st.device && po._t > seen) n++;
    for (const list of Object.values(J.cmts)) for (const c of list) if (c._d !== st.device && c._t > seen && J.posts[c.postId]) n++;
    return n;
  }
  function refreshBadge() {
    const b = $('#nav-stories-badge'); if (!b) return;
    let n = 0; try { n = S.family && J.warmed ? unseenCount(Quests.state()) : 0; } catch (e) { n = 0; }
    b.textContent = n ? String(n) : ''; b.classList.toggle('hidden', !n);
  }
  function markSeen() { try { localStorage.setItem('storiesSeen', String(Date.now())); } catch (e) { /* blocked */ } }

  /* ---------------------------------------------------------------- stories and replies: writing */
  async function putSealed(key, obj) { Quests.setFact(key, await Media.seal(obj, key)); }
  async function addPost(dr) {
    const st = Quests.state(), id = Media.newId(), key = 'post|' + id;
    const v = { on: true, p: dr.p, d: dr.d, t: Date.now(), text: String(dr.text || '').trim().slice(0, MAX_TEXT), mood: dr.mood || '', q: dr.q || '', media: (dr.media || []).slice(0, MAX_MEDIA) };
    J.posts[id] = Object.assign({ id, _t: v.t, _d: st.device }, v);
    for (const m of v.media) if (!J.media[m.id]) J.media[m.id] = { id: m.id, k: m.k, p: v.p, d: v.d, tag: 'story', stub: true };
    await putSealed(key, v);
    const pl = Quests.view(st, v.p);
    if (!(pl.done.diary || []).includes(v.d)) Quests.complete(v.p, 'diary', v.d);          // the first story of the day is the diary tick (its own party)
    else Quests.celebrate('📖', 'Posted!', 'Everyone sees it after the next sync', v.p, 'quest');
    return id;
  }
  async function addComment(postId, dr) {
    const st = Quests.state(), id = Media.newId(), key = `cmt|${postId}|${id}`;
    const v = { on: true, p: dr.p, t: Date.now(), text: String(dr.text || '').trim().slice(0, MAX_TEXT), media: dr.media && dr.media[0] ? { id: dr.media[0].id, k: dr.media[0].k } : null };
    (J.cmts[postId] = J.cmts[postId] || []).push(Object.assign({ id, postId, _t: v.t, _d: st.device }, v));
    if (v.media && !J.media[v.media.id]) J.media[v.media.id] = { id: v.media.id, k: v.media.k, p: v.p, d: (J.posts[postId] || {}).d || '', tag: 'story', stub: true };
    await putSealed(key, v);
    FX.haptic(15);
    return id;
  }
  async function deletePost(id) {
    const po = J.posts[id]; if (!po || po.legacy) return;
    await putSealed('post|' + id, { on: false });
    delete J.posts[id];
    for (const m of po.media || []) await deleteMedia(m.id);
    for (const c of J.cmts[id] || []) if (c.media) await deleteMedia(c.media.id);
    delete J.cmts[id];
  }
  async function deleteComment(postId, id) {
    const list = J.cmts[postId] || [], c = list.find((x) => x.id === id); if (!c) return;
    await putSealed(`cmt|${postId}|${id}`, { on: false });
    J.cmts[postId] = list.filter((x) => x.id !== id);
    if (c.media) await deleteMedia(c.media.id);
  }
  async function deleteMedia(id) {
    const key = 'media|' + id;
    Quests.setFact(key, await Media.seal({ on: false }, key));
    await Media.remove(id);
    delete J.media[id];
  }

  /* ---------------------------------------------------------------- Home tile and the lost-kid strip */
  function storiesTileHtml(ctx) {
    try {
      if (!Media.enabled) return '';
      const n = J.warmed ? unseenCount(Quests.state()) : 0, today = postsOn(ctx.date).length;
      return `<button class="tile ht wide t5" data-go="story"><span class="ico">📖</span><span class="tt">Stories${n ? ` · ${n} new` : ''}</span><span class="ts">${today ? `${today} stor${today === 1 ? 'y' : 'ies'} today` : 'Nothing yet today'}${Quests.isGrandDevice() ? '' : ' · tell yours'}</span><span class="ts small">${Quests.isGrandDevice() ? 'See what they posted · tap ❤️ or reply' : 'Photos, drawings, emoji, replies'}</span></button>`;
    } catch (e) { if (window.logErr) logErr('stories tile: ' + ((e && e.message) || e)); return `<div class="tile wide t5"><span class="ico">📖</span><span class="tt">Stories</span><span class="ts">hit a problem: ${esc((e && e.message) || e)}</span></div>`; }
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
      const group = b.dataset.group; let ids;
      if (group && group.startsWith('post:')) { const po = J.posts[group.slice(5)]; ids = po ? (po.media || []).map((m) => m.id) : []; }
      else if (group) ids = looseOn(group).map((m) => m.id);
      else ids = [b.dataset.view];
      if (!ids.includes(b.dataset.view)) ids.unshift(b.dataset.view);
      openViewer(ids, Math.max(0, ids.indexOf(b.dataset.view)));
    });
  }
  function fill(root) { fillMedia(root); wireViews(root); }

  /* ---------------------------------------------------------------- photos in */
  async function addPhotos(p, d, tag, camera, max) {  // Media.pick runs synchronously up to the input click: keep this first
    const meta = { p, d, tag, id: Media.newId() };
    const files = await Media.pick({ camera, keep: camera ? (f) => Media.keepOriginal(f, meta) : null });   // Snap: the full-size original too
    const out = [];
    for (const file of files.slice(0, Math.max(1, max || 1))) {
      const m = out.length ? { p, d, tag, id: Media.newId() } : meta;
      try {
        const r = await Media.addImage(file, m);
        J.media[r.id] = { id: r.id, k: 'photo', p, d, tag, n: r.n, w: r.w, h: r.h, t: Date.now(), local: true };
        out.push(r.id);
      } catch (e) { alert(e.message || 'That photo could not be saved.'); }
    }
    return out;
  }
  const addPhoto = (p, d, tag, camera) => addPhotos(p, d, tag, camera, 1).then((ids) => ids[0] || null);

  /* ---------------------------------------------------------------- the drawing pad (its own full-screen overlay); resolves to the drawing id, null if left */
  function openDraw(p, d, tag) {
    return new Promise((resolve) => {
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
      const close = (id) => { ov.classList.add('hidden'); ov.innerHTML = ''; J.overlay = null; resolve(id || null); };
      const cancel = () => { if (strokes.length && !confirm('Leave without saving the drawing?')) return false; close(null); return true; };
      J.overlay = { back: cancel, kind: 'pad' };
      ov.querySelector('#pad-cancel').onclick = cancel;
      ov.querySelector('#pad-done').onclick = async (e) => {
        if (!strokes.length) return close(null);
        e.target.disabled = true;
        try {
          const r = await Media.addCanvas(cv, { p, d, tag: tag || 'story' });
          J.media[r.id] = { id: r.id, k: 'drawing', p, d, tag: tag || 'story', n: r.n, w: r.w, h: r.h, t: Date.now(), local: true };
          close(r.id);
          Quests.celebrate('🖍️', 'Masterpiece!', 'Added to your story', p, 'quest');
        } catch (err) { alert(err.message || 'Could not save the drawing.'); e.target.disabled = false; }
      };
    });
  }

  /* ---------------------------------------------------------------- the viewer (same overlay) */
  function openViewer(ids, i) {
    const ov = $('#overlay');
    J.viewer = { ids, i: i || 0 };
    ov.innerHTML = `<div class="viewer"><div class="viewer-img" id="viewer-img"><img alt=""></div><div class="viewer-bar"><button id="v-prev" aria-label="Previous">‹</button><div class="vi" id="v-info"></div><button id="v-next" aria-label="Next">›</button><button id="v-save" aria-label="Save this picture to the phone" title="Save">⬇️</button>${Quests.isParentDevice() ? `<button class="del" id="v-del" aria-label="Delete">🗑️</button>` : ''}<button id="v-close" aria-label="Close">✕</button></div></div>`;
    ov.classList.remove('hidden');
    if (typeof Nav !== 'undefined') Nav.pushOverlay();
    const img = ov.querySelector('img'), info = ov.querySelector('#v-info');
    const closeViewer = () => { ov.classList.add('hidden'); ov.innerHTML = ''; J.viewer = null; J.overlay = null; };
    J.overlay = { back: () => { closeViewer(); return true; }, kind: 'viewer' };
    const showAt = async (k) => {
      if (!J.viewer) return;
      J.viewer.i = (k + ids.length) % ids.length;
      const m = J.media[ids[J.viewer.i]];
      img.removeAttribute('src');
      if (!m) { info.textContent = 'That picture is gone.'; return; }
      info.textContent = `${Quests.label(m.p)}${m.d ? ' · ' + fmtDate(m.d) : ''}${m.tag === 'morning' ? ' · morning photo' : m.k === 'drawing' ? ' · drawing' : ''}${m.local ? ' · not backed up yet' : ''}${ids.length > 1 ? ` · ${J.viewer.i + 1} of ${ids.length}` : ''}`;
      const u = await Media.url(m.id, m.k === 'drawing' ? 'drawing' : 'photo');
      if (!J.viewer || J.media[ids[J.viewer.i]] !== m) return;
      if (u) img.src = u; else info.textContent += ' · not downloaded yet (needs internet)';
    };
    ov.querySelector('#v-prev').onclick = () => showAt(J.viewer.i - 1);
    ov.querySelector('#v-next').onclick = () => showAt(J.viewer.i + 1);
    ov.querySelector('#v-close').onclick = closeViewer;
    const sv = ov.querySelector('#v-save');                                  // 2 Nov 2026: the app-size copy out to Downloads (Android) or the share sheet (iOS)
    if (sv) sv.onclick = async () => {
      const m = J.media[ids[J.viewer.i]]; if (!m) return;
      sv.disabled = true;
      try { await Media.saveCopy(m.id, m.k === 'drawing' ? 'drawing' : 'photo', m); sv.textContent = '✓'; setTimeout(() => { sv.textContent = '⬇️'; sv.disabled = false; }, 1500); }
      catch (e) { sv.disabled = false; if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not save the picture.'); }
    };
    const del = ov.querySelector('#v-del');
    if (del) del.onclick = async () => {
      const m = J.media[ids[J.viewer.i]];
      if (!m || !confirm('Delete this picture for everyone?')) return;
      await deleteMedia(m.id);
      closeViewer();
      if (S.screen === 'story') renderStory();
      if (S.screen === 'home') renderHome();
    };
    let sx = null; const vi = ov.querySelector('#viewer-img');
    vi.onpointerdown = (e) => { sx = e.clientX; };
    vi.onpointerup = (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40 && ids.length > 1) showAt(J.viewer.i + (dx < 0 ? 1 : -1)); };
    showAt(J.viewer.i);
  }

  /* ---------------------------------------------------------------- the composer: a new story, or a reply (same overlay, state in J.draft) */
  function loadDraft() { try { return JSON.parse(localStorage.getItem('storyDraft') || 'null'); } catch (e) { return null; } }
  function saveDraft() { try { if (J.draft) localStorage.setItem('storyDraft', JSON.stringify(J.draft)); else localStorage.removeItem('storyDraft'); } catch (e) { /* blocked */ } }
  function clearDraft() { J.draft = null; try { localStorage.removeItem('storyDraft'); } catch (e) { /* blocked */ } }
  function openComposer(opts) {
    opts = opts || {};
    const st = Quests.state(), ctx = currentContext(), mode = opts.mode === 'reply' ? 'reply' : 'post', d = opts.d || ctx.date;
    let dr = J.draft && J.draft.mode === mode ? J.draft : null;
    if (!dr) { const saved = loadDraft(); if (saved && saved.mode === mode && (mode === 'post' ? saved.d === d : saved.postId === opts.postId)) dr = saved; }
    if (!dr) dr = { mode, p: opts.p || st.active, d, postId: opts.postId || null, text: '', mood: '', q: '', media: [] };
    if (!Array.isArray(dr.media)) dr.media = [];
    if (!Quests.visiblePlayers().includes(dr.p)) dr.p = st.active;
    J.draft = dr;
    renderComposer();
  }
  const firstLine = (po) => (po.text || '').split('\n')[0].slice(0, 60) || (po.media && po.media.length ? '📷 a picture' : '');
  function mediaThumbs(dr) {
    return dr.media.map((m) => `<div class="th"><img class="${m.k === 'drawing' ? 'dr' : 'ph'}" data-oid="${esc(m.k === 'drawing' ? m.id : m.id + 't')}" data-kind="${m.k === 'drawing' ? 'drawing' : 'thumb'}" alt=""><button class="rm" data-rm="${esc(m.id)}" aria-label="Remove">✕</button></div>`).join('');
  }
  function renderComposer() {
    const ov = $('#overlay'), st = Quests.state(), ctx = currentContext(), dr = J.draft, reply = dr.mode === 'reply';
    if (typeof Nav !== 'undefined') Nav.pushOverlay();
    const post = reply ? J.posts[dr.postId] : null, city = cityOf(dr.d, ctx), prompt = reply ? null : promptFor(city, dr.d);
    const players = Quests.visiblePlayers(), max = reply ? 1 : MAX_MEDIA, avc = {}, av = (p) => avc[p] || (avc[p] = Quests.view(st, p).avatar);
    const title = reply ? `💬 Reply to ${esc(Quests.label(post ? post.p : ''))}` : (dr.d === ctx.date ? '✏️ New story' : `✏️ Story for ${esc(fmtDate(dr.d))}`);
    let html = `<div class="composer"><div class="pad-bar cbar"><button id="c-cancel" aria-label="Close">✕</button><div class="ctitle">${title}</div><button class="done" id="c-post" disabled>${reply ? 'Reply' : 'Post'}</button></div><div class="cbody">`;
    if (players.length > 1) html += `<div class="players">` + players.map((q) => `<button class="player${q === dr.p ? ' active' : ''}" data-pl="${esc(q)}"><span class="av">${av(q)}</span><span class="nm">${esc(Quests.label(q))}</span></button>`).join('') + `</div>`;
    if (reply) html += `<div class="quote"><b>${esc(Quests.label(post ? post.p : ''))}</b>: ${esc(post ? firstLine(post) : '')}</div>`;
    else {
      html += `<div class="moods">` + MOODS.map(([id, e, t]) => `<button class="mood${dr.mood === id ? ' on' : ''}" data-mood="${id}"><span class="me">${e}</span><span class="mt">${t}</span></button>`).join('') + `</div>`;
      html += `<button class="chip prompt${dr.q ? ' on' : ''}" id="c-prompt">💭 ${esc(prompt.q)}${dr.q ? ' ✓' : ''}</button>`;
    }
    html += `<textarea class="page-text ctext" id="c-text" maxlength="${MAX_TEXT}" rows="4" placeholder="${reply ? 'Say something…' : 'What happened today?'}">${esc(dr.text || '')}</textarea>`;
    html += `<div class="emoji-bar">` + EMOJI.map((e) => `<button type="button" data-e="${e}" aria-label="${e}">${e}</button>`).join('') + `</div>`;
    html += `<div class="cmedia" id="c-media">${mediaThumbs(dr)}</div>`;
    html += `<div class="row"><button class="btn" data-snap="camera">📷 Snap</button><button class="btn" data-snap="library">🖼️ Photos</button><button class="btn" id="c-draw">🖍️ Draw</button></div>${Media.origHint() ? `<p class="tiny muted">${esc(Media.origHint())}</p>` : ''}`;
    html += `</div></div>`;
    ov.innerHTML = html; ov.classList.remove('hidden');
    J.overlay = { back: cancelComposer, kind: 'composer' };
    wireComposer(ov, prompt, max);
    fillMedia(ov);
    attachViewport(ov);
  }
  function wireComposer(ov, prompt, max) {
    const dr = J.draft, ta = ov.querySelector('#c-text'), postBtn = ov.querySelector('#c-post');
    let busy = 0;                                                        // pictures still being shrunk and sealed: Post waits for them
    const refresh = () => { postBtn.disabled = busy > 0 || !(String(dr.text || '').trim() || dr.media.length); postBtn.textContent = busy > 0 ? '…' : (dr.mode === 'reply' ? 'Reply' : 'Post'); };
    refresh();
    ov.querySelectorAll('[data-pl]').forEach((b) => b.onclick = () => { dr.p = b.dataset.pl; Quests.setActive(dr.p); ov.querySelectorAll('.player').forEach((x) => x.classList.toggle('active', x === b)); saveDraft(); });
    ov.querySelectorAll('[data-mood]').forEach((b) => b.onclick = () => { dr.mood = dr.mood === b.dataset.mood ? '' : b.dataset.mood; ov.querySelectorAll('.mood').forEach((x) => x.classList.toggle('on', x.dataset.mood === dr.mood)); FX.haptic(15); saveDraft(); });
    const pr = ov.querySelector('#c-prompt');
    if (pr) pr.onclick = () => { dr.q = dr.q ? '' : prompt.q; pr.classList.toggle('on', !!dr.q); pr.textContent = '💭 ' + prompt.q + (dr.q ? ' ✓' : ''); saveDraft(); ta.focus(); };
    let timer = null;
    ta.oninput = () => { dr.text = ta.value.slice(0, MAX_TEXT); refresh(); clearTimeout(timer); timer = setTimeout(saveDraft, 300); };
    ov.querySelectorAll('[data-e]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();                       // keep the keyboard and the caret where they are
      b.onclick = () => {
        const e = b.dataset.e; if (ta.value.length + e.length > MAX_TEXT) return;
        const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, en = ta.selectionEnd == null ? s : ta.selectionEnd;
        try { ta.setRangeText(e, s, en, 'end'); } catch (err) { ta.value += e; }
        ta.dispatchEvent(new Event('input')); ta.focus();
      };
    });
    const full = () => { alert(max === 1 ? 'A reply carries one picture.' : `Up to ${max} pictures in one story.`); };
    ov.querySelectorAll('[data-snap]').forEach((b) => b.onclick = () => {
      const left = max - dr.media.length; if (left <= 0) return full();
      busy++; refresh();
      addPhotos(dr.p, dr.d, 'story', b.dataset.snap === 'camera', left).then((ids) => {
        for (const id of ids) dr.media.push({ id, k: 'photo' });
        saveDraft(); const cm = ov.querySelector('#c-media'); if (cm) { cm.innerHTML = mediaThumbs(dr); wireThumbs(ov); fillMedia(ov); }
      }).finally(() => { busy--; refresh(); });
    });
    ov.querySelector('#c-draw').onclick = () => {
      if (dr.media.length >= max) return full();
      openDraw(dr.p, dr.d, 'story').then((id) => { if (id) { dr.media.push({ id, k: 'drawing' }); saveDraft(); } if (J.draft) renderComposer(); });   // the pad borrows the overlay; the composer comes back from J.draft
    };
    wireThumbs(ov);
    ov.querySelector('#c-cancel').onclick = cancelComposer;
    postBtn.onclick = async () => {
      postBtn.disabled = true;
      try {
        if (dr.mode === 'reply') await addComment(dr.postId, dr); else await addPost(dr);
        closeComposer(true);
      } catch (e) { postBtn.disabled = false; alert((e && e.message) || 'Could not post.'); }
    };
  }
  function wireThumbs(ov) {
    ov.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
      const id = b.dataset.rm; J.draft.media = J.draft.media.filter((m) => m.id !== id); deleteMedia(id); saveDraft(); b.parentElement.remove();
      const pb = ov.querySelector('#c-post'); if (pb) pb.disabled = !(String(J.draft.text || '').trim() || J.draft.media.length);
    });
  }
  function cancelComposer() {
    const dr = J.draft;
    if (dr && (String(dr.text || '').trim() || dr.media.length) && !confirm(dr.mode === 'reply' ? 'Throw this reply away?' : 'Throw this story away?')) return false;
    if (dr) for (const m of dr.media || []) deleteMedia(m.id);
    clearDraft(); closeComposer(false); return true;
  }
  function closeComposer(posted) {
    const ov = $('#overlay'); detachViewport();
    ov.classList.add('hidden'); ov.innerHTML = ''; J.overlay = null;
    if (posted) clearDraft();
    J.dirty = false;
    if (S.screen === 'story') renderStory();
    if (S.screen === 'home') renderHome();
  }
  function attachViewport(ov) {           // iOS: the keyboard shrinks the visual viewport, not the layout one; size the composer to it
    detachViewport();
    if (!window.visualViewport) return;
    const fit = () => { const c = ov.querySelector('.composer'); if (c) c.style.height = Math.round(visualViewport.height) + 'px'; };
    J.vv = fit; visualViewport.addEventListener('resize', fit); fit();
  }
  function detachViewport() { if (J.vv && window.visualViewport) visualViewport.removeEventListener('resize', J.vv); J.vv = null; }

  /* ---------------------------------------------------------------- the feed: every day, newest first */
  function timeOf(po, ctx) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: tzOf(cityOf(po.d, ctx)), hour: '2-digit', minute: '2-digit' }).format(new Date(po.t || 0)); } catch (e) { return ''; }
  }
  function pic(m) { return `<img class="${m.k === 'drawing' ? 'dr' : 'ph'}" data-oid="${esc(m.k === 'drawing' ? m.id : m.id + 't')}" data-kind="${m.k === 'drawing' ? 'drawing' : 'thumb'}" alt="">`; }
  function postHtml(po, st, ctx, av, cards, ro) {
    const cm = J.cmts[po.id] || [], reacts = cm.filter((c) => !c.media && isEmojiOnly(c.text)), replies = cm.filter((c) => !reacts.includes(c));
    const media = (po.media || []).filter((m) => J.media[m.id]);
    let h = `<div class="post" data-post="${esc(po.id)}"><div class="post-head"><span class="av">${av(po.p)}</span><b>${esc(Quests.label(po.p))}</b>${MOOD[po.mood] ? `<span class="pmood">${MOOD[po.mood][1]}</span>` : ''}${cards && cards[po.id] ? (cards[po.id].sent ? '<span class="chip pc">📮 sent</span>' : cards[po.id].pending ? '<span class="chip pc">📮 waiting</span>' : '') : ''}<span class="post-time">${po.legacy ? '' : esc(timeOf(po, ctx))}</span></div>`;
    if (po.q) h += `<div class="post-q">${esc(po.q)}</div>`;
    if (po.text) h += `<div class="post-text">${esc(po.text)}</div>`;
    if (media.length) h += `<div class="post-grid${media.length === 1 ? ' one' : ''}">${media.map((m) => `<button data-view="${esc(m.id)}" data-group="post:${esc(po.id)}">${pic(m)}</button>`).join('')}</div>`;
    if (reacts.length) {
      const by = {}; for (const r of reacts) { const e = r.text.trim(); (by[e] = by[e] || []).push(r); }
      h += `<div class="reacts">${Object.entries(by).map(([e, rs]) => `<span class="react">${esc(e)} ${rs.map((r) => av(r.p)).join('')}</span>`).join('')}</div>`;
    }
    if (replies.length) h += `<div class="cmts">${replies.map((c) => `<div class="cmt"><span class="av">${av(c.p)}</span><div class="ct"><b>${esc(Quests.label(c.p))}</b> ${esc(c.text || '')}${c.media && J.media[c.media.id] ? `<button class="phbtn" data-view="${esc(c.media.id)}">${pic(c.media)}</button>` : ''}</div>${canDelete(c, st) ? `<button class="xdel" data-del-cmt="${esc(po.id)}|${esc(c.id)}" aria-label="Delete reply">🗑️</button>` : ''}</div>`).join('')}</div>`;
    h += `<div class="post-foot">${QUICK.map((e) => { const mine = reacts.some((r) => r.p === st.active && r.text.trim() === e); return `<button class="quick${mine ? ' on' : ''}" data-quick="${esc(po.id)}|${e}" aria-label="${e}">${e}</button>`; }).join('')}<button class="btn small-btn" data-reply="${esc(po.id)}">💬 Reply</button>${ro ? '' : `<button class="btn small-btn" data-card="${esc(po.id)}">📮 Postcard</button>`}${canDelete(po, st) ? `<button class="btn small-btn del" data-del-post="${esc(po.id)}" aria-label="Delete story">🗑️</button>` : ''}</div></div>`;
    return h;
  }
  function renderStory() { return guarded($('#screen-story'), '📖 Stories', renderStoryInner); }
  function renderStoryInner() {
    const el = $('#screen-story'), ctx = currentContext(), F = S.family, st = Quests.state();
    if (!Media.enabled) { el.innerHTML = `<h1 class="h1">📖 Stories</h1><div class="card">Stories and photos need a full rebuild of the app: this build has no media key.</div>`; return; }
    if (!J.warmed) { el.innerHTML = `<h1 class="h1">📖 Stories</h1><p class="muted">Opening the stories…</p>`; warm(); return; }
    const avc = {}, av = (p) => avc[p] || (avc[p] = Quests.view(st, p).avatar), ro = Quests.isGrandDevice();   // ro: Grandma and Grandpa's phone reads only (2 Nov 2026)
    const used = usedMediaIds(), dates = new Set(), cards = Quests.cardStatuses ? Quests.cardStatuses(st) : {};
    for (let d = F.trip.start; d <= ctx.date && d <= F.trip.end; d = Quests.addDays(d, 1)) dates.add(d);
    for (const po of Object.values(J.posts)) if (po.d) dates.add(po.d);
    for (const m of index()) if (m.d && m.tag !== 'story') dates.add(m.d);
    const badgeDates = {};
    for (const b of Quests.badges(Quests.view(st, st.active), ctx)) { const on = b.opens || b.on; if (b.earned && on && (b.kind === 'stamp' || b.kind === 'milestone')) (badgeDates[on] = badgeDates[on] || []).push(b); }
    let html = `<h1 class="h1">📖 Stories</h1>`, any = false;
    if (ro) html += `<div class="row">${Quests.visiblePlayers().map((p) => `<button class="pill${st.active === p ? ' active' : ''}" data-me="${esc(p)}">${av(p)} I'm ${esc(Quests.label(p))}</button>`).join('')}</div>`;   // whose ❤️ and replies these are
    if (!ro) html += `<button class="btn primary block new-story" data-new="${esc(ctx.date)}">✏️ New story</button>`;
    if (J.error) html += `<div class="card red"><b>Could not open the stories.</b><div class="small">${esc(J.error)}</div><div class="small">Tell Andy what it says, then try Settings → Sync now.</div></div>`;
    const o = Media.originalsSummary();
    if (!ro && Media.canSaveOriginals() && o.waiting) {
      html += `<div class="card originals"><b>📥 ${o.waiting} full-size photo${o.waiting === 1 ? '' : 's'} not yet in Photos</b> <span class="muted small">(${(o.waitingBytes / 1048576).toFixed(1)} MB)</span><div class="row"><button class="btn" id="orig-save">Save to Photos</button></div><div class="tiny muted">One tap saves up to ${Media.LIMITS.shareBatch} at a time. Then Photos has the originals and the app keeps the small copies.</div></div>`;
      Media.prepareOriginals();
    }
    for (const date of [...dates].sort().reverse()) {
      const day = dayOf(date), city = cityOf(date, ctx), key = Quests.CITY_KEY[city] || 'home';
      const photos = looseOn(date, used), posts = postsOn(date);
      const moves = (F.moves || []).filter((m) => m.date === date), stamps = badgeDates[date] || [];
      const empty = !photos.length && !posts.length;
      if (!empty) any = true;
      html += `<div class="card story-day${empty ? ' story-empty' : ''}" data-date="${esc(date)}" style="--city:var(--c-${key})"><div class="story-head"><span class="se">${Quests.CITY_EMOJI[city] || '📍'}</span><div><b>${esc(fmtDate(date))}</b>${date === ctx.date ? '<span class="chip red">today</span>' : ''}<div class="small muted">${esc(day ? day.where : (city === 'Home' ? 'At home' : city))}</div></div></div>`;
      if (moves.length) html += moves.map((m) => `<div class="small">${/train/i.test(m.mode || '') ? '🚆' : /coach|bus/i.test(m.mode || '') ? '🚌' : '✈️'} ${esc(m.frm)} → ${esc(m.to)} · ${esc(m.depart)}</div>`).join('');
      if (stamps.length) html += `<div class="stickers">${stamps.map((b) => `<span class="sticker">${b.e} ${esc(b.t)}</span>`).join('')}</div>`;
      if (photos.length) html += `<div class="story-grid">${photos.map((m) => `<button data-view="${esc(m.id)}" data-group="${esc(date)}"><img class="ph" data-oid="${esc(m.id)}t" data-kind="thumb" alt=""></button>`).join('')}</div>`;
      for (const po of posts) html += postHtml(po, st, ctx, av, cards, ro);
      html += `${ro ? '' : `<div class="row"><button class="btn small-btn" data-new="${esc(date)}">＋ Add a story to this day</button></div>`}</div>`;
    }
    if (!any) html += `<p class="small muted">${ro ? 'No stories yet. They appear here once the family posts and this phone syncs.' : 'No stories yet. Tap ✏️ New story.'}</p>`;
    const y = window.scrollY;
    el.innerHTML = html;
    window.scrollTo(0, y);
    wireViews(el);
    el.querySelectorAll('[data-me]').forEach((b) => b.onclick = () => { Quests.setActive(b.dataset.me); renderStory(); });
    el.querySelectorAll('[data-new]').forEach((b) => b.onclick = () => openComposer({ mode: 'post', d: b.dataset.new }));
    el.querySelectorAll('[data-reply]').forEach((b) => b.onclick = () => openComposer({ mode: 'reply', postId: b.dataset.reply, d: (J.posts[b.dataset.reply] || {}).d }));
    el.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => { if (window.Postcard) Postcard.openPreview(b.dataset.card); });
    el.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => {
      const [postId, e] = b.dataset.quick.split('|'); b.disabled = true; FX.pulse(b, 'bump', 600);
      const mine = (J.cmts[postId] || []).find((c) => c.p === st.active && !c.media && c.text.trim() === e);
      (mine ? deleteComment(postId, mine.id) : addComment(postId, { p: st.active, text: e, media: null })).then(() => renderStory());
    });
    el.querySelectorAll('[data-del-post]').forEach((b) => b.onclick = () => { if (confirm('Delete this story for everyone?')) deletePost(b.dataset.delPost).then(() => renderStory()); });
    el.querySelectorAll('[data-del-cmt]').forEach((b) => b.onclick = () => { const [postId, id] = b.dataset.delCmt.split('|'); if (confirm('Delete this reply for everyone?')) deleteComment(postId, id).then(() => renderStory()); });
    const os = el.querySelector('#orig-save');
    if (os) os.onclick = () => { os.disabled = true; Media.saveOriginals().then((r) => { if (r.saved) Quests.celebrate('📥', `Saved ${r.saved} to Photos`, r.left ? `${r.left} more to go: tap again` : 'All your full-size photos are in Photos', st.active, 'ok'); renderStory(); }).catch((e) => { os.disabled = false; if (e && e.name !== 'AbortError') alert(e.message || 'Could not hand the photos over.'); }); };
    observe(el);
    markSeen(); refreshBadge();
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
    if (screen !== 'story') return;
    if (J.observer) { J.observer.disconnect(); J.observer = null; }
    if (window.Postcard) Postcard.releaseUrls();
    Media.release();
  }
  /* for the globe (2 Nov 2026): jump to a day's card, and a city's numbers for the badge popup */
  function scrollToDate(d) {
    const go = () => { const c = document.querySelector(`#screen-story .story-day[data-date="${d}"]`); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    if (J.warmed) setTimeout(go, 80); else warm().then(() => setTimeout(go, 400));
  }
  function cityStats(city) {
    const ctx = currentContext(), want = city === 'Townsville' ? ['Townsville', 'Home'] : [city], at = (d) => want.includes(cityOf(d, ctx));
    const posts = Object.values(J.posts).filter((p) => p.d && at(p.d)).sort((a, b) => (a.d < b.d ? -1 : 1));
    const pics = index().filter((m) => m.d && at(m.d)), photo = pics.find((m) => m.k === 'photo') || null;
    return { stories: posts.length, pictures: pics.length, firstDate: posts.length ? posts[0].d : (pics.length ? pics[0].d : null), photoId: photo ? photo.id : null };
  }
  async function downloadAll(onProgress) {
    const ms = index(), total = ms.length * 2; let done = 0;
    for (const m of ms) {
      if (m.k === 'photo') await Media.ensure(m.id + 't', 'thumb');
      await Media.ensure(m.id, m.k === 'drawing' ? 'drawing' : 'photo');
      done += 2; if (onProgress) onProgress(Math.min(done, total), total);
    }
  }

  return { init, warm, page, promptFor, index, storiesTileHtml, morningHtml, fill, renderStory, openComposer, openDraw, openViewer, onLeave, addPhoto, addPhotos, downloadAll, refreshBadge, post, cityOf,
    overlayOpen: () => !!J.overlay, overlayBack: () => (J.overlay ? J.overlay.back() : true), diag, scrollToDate, cityStats };
})();
