/* World Adventure postcards (journal.js; the Postcards tab. It began as the Stories tab, 1 Nov 2026 evening): the family's
   board. Anyone writes a postcard any time (the words, a mood, the question of the day, up to six photos or drawings
   glued on), replies to one (text, emoji, one picture) or taps a quick emoji on it. Also the morning photos for the
   lost-kid card.
   17 Nov 2026 (Andy: "lets actually call it postcards… a mini simple social page with postcards, the family creates them,
   the grandparents read, view photos and react… incredibly simple for the oldies"): every post shows as a postcard
   (postcard.js draws the card), with a small panel under it for the reactions and the replies. The names inside this
   file (post, story, renderStory, the `storiesSeen` key) are the old ones on purpose: they are what the stored facts and
   the other files call these things.
   A post is one sealed fact `post|<id>` {on,p,d,t,text,mood,q,media:[{id,k}]}; a reply is `cmt|<postId>|<id>`
   {on,p,t,text,media}; a reply that is only emoji shows as a reaction. The pages written before this (facts
   `page|<p>|<date>|<field>`) show as read-only posts. Pictures are Media objects indexed by sealed `media|<id>` facts.
   Everything rides the ordinary facts sync and survives "Reset all quest progress". Nothing on a kids' device waits
   for a parent. A reply with `seen: true` is not a reply: it is Grandma and Grandpa's phone saying a card has been on
   its screen (17 Nov 2026), so the family can see "seen by Grandma and Grandpa" under it; its text is 👀 so a device
   still on an older build shows it as a quick emoji. Loaded after quests.js and before app.js; it uses app.js helpers
   ($, esc, fmtDate, tzOf, currentContext, show, renderHome, dayOf, wireGo, Nav, logErr) at call time only. Nothing here
   names the 5 January plan. */
'use strict';
window.Journal = (() => {
  const MOODS = [['amazing', '🤩', 'Amazing'], ['good', '😊', 'Good'], ['ok', '😐', 'OK'], ['tired', '😴', 'Tired'], ['sad', '😢', 'Sad']];
  const MOOD = Object.fromEntries(MOODS.map((m) => [m[0], m]));
  const COLOURS = ['#1B1B2F', '#E63946', '#FF7A00', '#FFB703', '#2A9D8F', '#3A86FF', '#7B2CBF', '#FF4D8D'];
  const SIZES = [6, 14, 28];
  const EMOJI = ['😀', '😂', '🤩', '😍', '😎', '🥳', '😴', '🥶', '🤯', '😱', '😋', '🤔', '❤️', '🎉', '👍', '🙌', '🔥', '⭐', '🍣', '🍜', '🍕', '🍦', '🍩', '⛷️', '🏂', '⛄', '❄️', '🗼', '🗽', '🏒', '🚄', '✈️', '🐻', '🦌', '🦖'];
  const QUICK = ['❤️', '😂', '🤩', '👍', '🎉'];
  const MAX_TEXT = 500, MAX_MEDIA = 6;
  const PAGE = 8;                                                      // postcards on the board before "Show older postcards"
  const J = { pages: {}, posts: {}, cmts: {}, seen: {}, media: {}, cache: {}, warmed: false, warming: null, again: false, observer: null, watcher: null, viewer: null, overlay: null, draft: null, dirty: false, vv: null, error: null,
    limit: PAGE, newSince: null, html: null, fitOn: false };   // limit: how many cards are drawn; newSince: when this device last looked (the New! flags of this visit); html: what the board shows now

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
    return `warmed ${J.warmed} · ${J.error ? 'error ' + J.error : 'ok'} · postcards ${Object.keys(J.posts).length} · replies ${replies} · pictures ${Object.keys(J.media).length} · facts ${kb} KB`;
  }
  const composerOpen = () => !!(J.overlay && J.overlay.kind === 'composer');
  function warm() {
    if (J.warming) { J.again = true; return J.warming; }
    J.warming = (async () => {
      try {
        if (!Media.enabled) { J.warmed = true; return; }
        const pf = Quests.factsByPrefix('page|'), mf = Quests.factsByPrefix('media|'), sf = Quests.factsByPrefix('post|'), cf = Quests.factsByPrefix('cmt|');
        const pages = {}, media = {}, posts = {}, cmts = {}, seen = {};
        await Promise.all(Object.entries(pf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v) return;
          const parts = k.split('|'), pk = pkey(parts[1], parts[2]);
          (pages[pk] = pages[pk] || {})[parts[3]] = v.v;
        }));
        const gone = new Set();                                               // pictures deleted for everyone: no stub brings them back (15 Nov 2026)
        await Promise.all(Object.entries(mf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v) return;
          const id = k.slice(6);
          if (!v.on) { gone.add(id); return; }
          media[id] = Object.assign({ id }, v);
        }));
        await Promise.all(Object.entries(sf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v || !v.on) return;
          const id = k.slice(5); posts[id] = Object.assign({ id, _t: f.t, _d: f.d || '' }, v);
        }));
        await Promise.all(Object.entries(cf).map(async ([k, f]) => {
          const v = await openCached(k, f); if (!v || !v.on) return;
          const parts = k.split('|'); if (parts.length < 3) return;
          if (v.seen) { const l = (seen[parts[1]] = seen[parts[1]] || []); if (!l.includes(v.p)) l.push(v.p); return; }   // "this card has been on our screen": a mark, not a reply
          (cmts[parts[1]] = cmts[parts[1]] || []).push(Object.assign({ id: parts[2], postId: parts[1], _t: f.t, _d: f.d || '' }, v));
        }));
        for (const list of Object.values(cmts)) list.sort((a, b) => (a.t || 0) - (b.t || 0));
        // the pages written before there was a board: read-only postcards, so nothing already written is lost
        for (const [pk, pg] of Object.entries(pages)) {
          if (!(pg.mood || pg.text || pg.photo || pg.draw)) continue;
          const [p, d] = pk.split('|'), id = 'pg-' + p + '-' + d, tf = pf[`page|${p}|${d}|text`] || pf[`page|${p}|${d}|mood`];
          const list = []; if (pg.photo) list.push({ id: pg.photo, k: 'photo' }); if (pg.draw) list.push({ id: pg.draw, k: 'drawing' });
          posts[id] = { id, p, d, t: (tf && tf.t) || Date.parse(d + 'T12:00:00Z'), text: pg.text || '', mood: pg.mood || '', q: pg.q || '', media: list, legacy: true, _t: 0, _d: '' };
        }
        for (const r of await Media.pendingList()) if (!media[r.id] && !gone.has(r.id)) media[r.id] = { id: r.id, k: r.k, p: r.p, d: r.d, tag: r.tag || '', n: r.n, w: r.w, h: r.h, t: r.at, local: true };
        // a postcard can arrive before its pictures are uploaded: a stub lets the thumbnail and the viewer try to fetch them
        const stub = (m, p, d) => { if (m && m.id && !media[m.id] && !gone.has(m.id)) media[m.id] = { id: m.id, k: m.k || 'photo', p, d, tag: 'story', stub: true }; };
        for (const po of Object.values(posts)) for (const m of po.media || []) stub(m, po.p, po.d);
        for (const list of Object.values(cmts)) for (const c of list) stub(c.media, c.p, posts[c.postId] ? posts[c.postId].d : '');
        J.pages = pages; J.media = media; J.posts = posts; J.cmts = cmts; J.seen = seen; J.warmed = true; J.error = null;
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
    (async () => { for (const m of ms) { try { if (m.k === 'photo') await Media.ensure(m.id + 't', 'thumb'); await Media.ensure(m.id, kindOf(m)); } catch (e) { /* next sync */ } } })();
  }
  function prefetchMorning() {           // parent phones: today's morning photos at full size, so the lost-kid card works offline
    if (!Quests.isParentDevice()) return;
    const today = currentContext().date;
    for (const m of mediaOn(today, (m) => m.k === 'photo' && m.tag === 'morning' && !m.local)) Media.ensure(m.id, 'photo');
  }

  /* ---------------------------------------------------------------- postcards and replies: reading */
  function post(id) { return J.posts[id] || null; }
  function postsOn(date) { return Object.values(J.posts).filter((po) => po.d === date).sort((a, b) => (a.t || 0) - (b.t || 0)); }
  function usedMediaIds() {
    const s = new Set();
    for (const po of Object.values(J.posts)) for (const m of po.media || []) s.add(m.id);
    for (const list of Object.values(J.cmts)) for (const c of list) if (c.media) s.add(c.media.id);
    return s;
  }
  function looseOn(date, used) { used = used || usedMediaIds(); return mediaOn(date, (m) => m.k === 'photo' && m.tag !== 'story' && !used.has(m.id)); }   // the morning photos and the like
  /* built at run time, not written as literals (15 Nov 2026): an engine that does not know these Unicode properties rejects a literal
     while reading the file, and the whole of Stories would be gone; here it falls back to the emoji this app itself offers */
  let RE_PICTO = null, RE_EMOJI_ONLY = null;
  try { RE_PICTO = new RegExp('\\p{Extended_Pictographic}', 'u'); RE_EMOJI_ONLY = new RegExp('^[\\p{Extended_Pictographic}\\p{Emoji_Component}\\u200d\\ufe0f\\s]+$', 'u'); } catch (e) { RE_PICTO = RE_EMOJI_ONLY = null; }
  function isEmojiOnly(s) {
    s = String(s || '').trim();
    if (!s) return false;
    if (RE_PICTO) return RE_PICTO.test(s) && RE_EMOJI_ONLY.test(s);
    return QUICK.includes(s) || EMOJI.includes(s);
  }
  const kindOf = (m) => (m && m.k === 'drawing' ? 'drawing' : 'photo');
  const canDelete = (x, st) => !x.legacy && !Quests.isGrandDevice() && (x._d === st.device || Quests.isParentDevice());   // no bin on Grandma and Grandpa's phone (3 Nov 2026); a second tap on ❤️ still takes their ❤️ back
  function unseenCount(st) {             // postcards and replies from another device since this device last looked at the board
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

  /* ---------------------------------------------------------------- postcards and replies: writing */
  async function putSealed(key, obj) { Quests.setFact(key, await Media.seal(obj, key)); }
  async function addPost(dr) {
    const st = Quests.state(), id = dr.id || Media.newId(), key = 'post|' + id;   // the id it was written under: its pictures sit on the card where the composer showed them
    const v = { on: true, p: dr.p, d: dr.d, t: Date.now(), text: String(dr.text || '').trim().slice(0, MAX_TEXT), mood: dr.mood || '', q: dr.q || '', media: (dr.media || []).slice(0, MAX_MEDIA) };
    J.posts[id] = Object.assign({ id, _t: v.t, _d: st.device }, v);
    for (const m of v.media) if (!J.media[m.id]) J.media[m.id] = { id: m.id, k: m.k, p: v.p, d: v.d, tag: 'story', stub: true };
    await putSealed(key, v);
    const pl = Quests.view(st, v.p);
    if (!(pl.done.diary || []).includes(v.d)) Quests.complete(v.p, 'diary', v.d);          // the first postcard of the day is the diary tick (its own party)
    else Quests.celebrate('💌', 'Posted!', 'Everyone sees your postcard after the next sync', v.p, 'quest');
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
    J.cmts[postId] = list.filter((x) => x.id !== id);                    // off this screen at once (17 Nov 2026: the panel redraws before the fact is sealed); the fact follows
    await putSealed(`cmt|${postId}|${id}`, { on: false });
    if (c.media) await deleteMedia(c.media.id);
  }
  async function deleteMedia(id) {
    const key = 'media|' + id;
    Quests.setFact(key, await Media.seal({ on: false }, key));
    await Media.remove(id);
    delete J.media[id];
  }
  /* Grandma and Grandpa's phone (17 Nov 2026): a card whose words have been on the screen for a moment is marked seen, once per
     device, so the family reads "seen by Grandma and Grandpa" under it. The mark rides as a reply (see the top of the file). */
  function markCardSeen(postId) {
    const st = Quests.state(), who = st.active;
    if (!J.posts[postId] || !who || (J.seen[postId] || []).includes(who)) return;
    (J.seen[postId] = J.seen[postId] || []).push(who);
    putSealed(`cmt|${postId}|seen-${st.device}`, { on: true, p: who, t: Date.now(), text: '👀', media: null, seen: true }).catch(() => { /* marked again on the next visit */ });
  }

  /* ---------------------------------------------------------------- Home tile and the lost-kid strip */
  function storiesTileHtml(ctx) {
    try {
      if (!Media.enabled) return '';
      const grand = Quests.isGrandDevice(), n = J.warmed ? unseenCount(Quests.state()) : 0, today = postsOn(ctx.date).length;
      const withPic = (po) => (po.media || []).find((m) => m.k === 'photo' && J.media[m.id]);
      const latest = Object.values(J.posts).filter(withPic).sort((a, b) => (b.t || 0) - (a.t || 0))[0], pic = latest ? withPic(latest) : null;   // the newest card's photo, as a little print on the tile
      return `<button class="tile ht wide t5${pic ? ' has-print' : ''}" data-go="story"><span class="ico">${n ? '📬' : '💌'}</span><span class="tt">Postcards${n ? ` · ${n} new` : ''}</span><span class="ts">${today ? `${today} postcard${today === 1 ? '' : 's'} today` : 'Nothing yet today'}${grand ? '' : ' · write yours'}</span><span class="ts small">${grand ? 'Look at the photos · tap ❤️ or write back' : 'Photos, drawings and your words on a card'}</span>${pic ? `<span class="tile-print"><img data-oid="${esc(pic.id)}t" data-kind="thumb" alt=""></span>` : ''}</button>`;
    } catch (e) { if (window.logErr) logErr('postcards tile: ' + ((e && e.message) || e)); return `<div class="tile wide t5"><span class="ico">💌</span><span class="tt">Postcards</span><span class="ts">hit a problem: ${esc((e && e.message) || e)}</span></div>`; }
  }
  function morningHtml(date) {
    if (!Media.enabled) return '';
    const ms = mediaOn(date, (m) => m.k === 'photo' && m.tag === 'morning');
    if (!ms.length) return `<div class="card red"><b>This morning's photo</b>: none in the app yet. Open Photos and have it ready to show.</div>`;
    return `<div class="card"><div class="h3">This morning's photos</div><div class="morning-strip">${ms.map((m) => `<button data-view="${esc(m.id)}" data-group="${esc(date)}"><img class="ph" data-oid="${esc(m.id)}t" data-kind="thumb" alt="${esc(Quests.label(m.p))}"></button>`).join('')}</div><div class="tiny muted">Tap one for full size.</div></div>`;
  }
  function loadImg(img) {                 // one picture into its <img>: decrypted (or fetched) on demand; "missing" comes off again once it arrives
    return Media.url(img.dataset.oid, img.dataset.kind).then((u) => {
      if (!u) { img.classList.add('missing'); return; }
      img.classList.remove('missing');
      if (!img.src) img.src = u;
      const full = img.dataset.full;                                     // a card's large picture (17 Nov 2026): the small copy first, then the full photo over it; not in light mode
      if (full && !img.dataset.sharp && !(typeof isLite === 'function' && isLite())) { img.dataset.sharp = '1'; Media.url(full, 'photo').then((f) => { if (f && img.dataset.sharp && img.src) img.src = f; }); }
    });
  }
  function fillMedia(root) { root.querySelectorAll('img[data-oid]').forEach((img) => { if (!img.src) loadImg(img); }); }
  function wireViews(root) {
    root.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => {
      const group = b.dataset.group; let ids;
      if (group && group.startsWith('post:')) { const po = J.posts[group.slice(5)]; ids = po ? (po.media || []).filter((m) => J.media[m.id]).map((m) => m.id) : []; }   // the pictures on the card, in the card's order
      else if (group) ids = looseOn(group).map((m) => m.id);
      else ids = [b.dataset.view];
      if (!ids.includes(b.dataset.view)) ids.unshift(b.dataset.view);
      openViewer(ids, Math.max(0, ids.indexOf(b.dataset.view)));
    });
  }
  function fill(root) { fillMedia(root); wireViews(root); }

  /* ---------------------------------------------------------------- photos in */
  /* onFiles runs once the picker has handed pictures over. A caller that shows "busy" starts it there, not at the tap (15 Nov 2026):
     browsers before Chrome 113 and Safari 16.4 say nothing when the picker is closed without a choice, so this promise then never
     settles, and a composer that counted from the tap sat on "…" with Post greyed out until the story was thrown away. */
  async function addPhotos(p, d, tag, camera, max, onFiles) {  // Media.pick runs synchronously up to the input click: keep this first
    const meta = { p, d, tag, id: Media.newId() };
    const files = await Media.pick({ camera, keep: camera ? (f) => Media.keepOriginal(f, meta) : null });   // Snap: the full-size original too
    const out = [];
    if (files.length && onFiles) onFiles(files.length);
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
      const close = (id) => { cv.width = cv.height = 0; ov.classList.add('hidden'); ov.innerHTML = ''; J.overlay = null; resolve(id || null); };   // the pad's pixels are handed back at once (a detached canvas keeps them until the next collection)
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
          Quests.celebrate('🖍️', 'Masterpiece!', 'Glued onto your postcard', p, 'quest');
        } catch (err) { alert(err.message || 'Could not save the drawing.'); e.target.disabled = false; }
      };
    });
  }

  /* ---------------------------------------------------------------- the viewer (same overlay)
     17 Nov 2026: made for Grandma and Grandpa. Buttons say what they do ("✕ Close", "⬇️ Save photo"), big arrows on the picture
     page through the pictures of the card, and a double tap or a pinch zooms in to see the faces. */
  function zoomable(box, img, onSwipe) {  // one finger pans a zoomed picture or swipes to the next; two fingers pinch; a double tap zooms in and out
    const Z = { s: 1, x: 0, y: 0, pts: new Map(), d0: 1, s0: 1, sx: 0, sy: 0, x0: 0, y0: 0, moved: false, tap: 0 };
    const apply = () => { img.style.transform = Z.s === 1 ? '' : `translate(${Math.round(Z.x)}px, ${Math.round(Z.y)}px) scale(${Z.s.toFixed(3)})`; };
    const clamp = () => { const mx = (Z.s - 1) * box.clientWidth / 2, my = (Z.s - 1) * box.clientHeight / 2; Z.x = Math.max(-mx, Math.min(mx, Z.x)); Z.y = Math.max(-my, Math.min(my, Z.y)); };
    const reset = () => { Z.s = 1; Z.x = Z.y = 0; apply(); };
    const two = () => { const v = [...Z.pts.values()]; return Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]) || 1; };
    box.onpointerdown = (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* it still works without capture */ }
      Z.pts.set(e.pointerId, [e.clientX, e.clientY]); Z.moved = false;
      if (Z.pts.size === 2) { Z.d0 = two(); Z.s0 = Z.s; } else { Z.sx = e.clientX; Z.sy = e.clientY; Z.x0 = Z.x; Z.y0 = Z.y; }
    };
    box.onpointermove = (e) => {
      if (!Z.pts.has(e.pointerId)) return;
      Z.pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (Z.pts.size === 2) { Z.s = Math.max(1, Math.min(4, Z.s0 * two() / Z.d0)); Z.moved = true; clamp(); apply(); }
      else if (Z.s > 1) { Z.x = Z.x0 + e.clientX - Z.sx; Z.y = Z.y0 + e.clientY - Z.sy; if (Math.abs(e.clientX - Z.sx) + Math.abs(e.clientY - Z.sy) > 6) Z.moved = true; clamp(); apply(); }
    };
    box.onpointerup = (e) => {
      if (!Z.pts.has(e.pointerId)) return;
      const was = Z.pts.size; Z.pts.delete(e.pointerId);
      if (was > 1) { const rest = [...Z.pts.values()][0]; if (rest) { Z.sx = rest[0]; Z.sy = rest[1]; Z.x0 = Z.x; Z.y0 = Z.y; } if (Z.s < 1.08) reset(); Z.moved = true; return; }
      const dx = e.clientX - Z.sx, dy = e.clientY - Z.sy;
      if (Z.s === 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { onSwipe(dx < 0 ? 1 : -1); return; }
      if (Z.moved || Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
      const now = Date.now();
      if (now - Z.tap > 330) { Z.tap = now; return; }
      Z.tap = 0;
      if (Z.s > 1) return reset();
      const r = box.getBoundingClientRect(); Z.s = 2.5; Z.x = (r.left + r.width / 2 - e.clientX) * 1.5; Z.y = (r.top + r.height / 2 - e.clientY) * 1.5; clamp(); apply();
    };
    box.onpointercancel = (e) => { Z.pts.delete(e.pointerId); };
    return { reset };
  }
  function openViewer(ids, i, opts) {    // opts.back: what to show when the viewer closes
    const ov = $('#overlay'), many = ids.length > 1;
    J.viewer = { ids, i: i || 0 };
    ov.innerHTML = `<div class="viewer"><div class="viewer-top"><div class="vi" id="v-info"></div><button class="txt" id="v-close">✕ Close</button></div>` +
      `<div class="viewer-img" id="viewer-img"><img alt="" draggable="false">${many ? `<button class="v-nav prev" id="v-prev" aria-label="Previous picture">‹</button><button class="v-nav next" id="v-next" aria-label="Next picture">›</button>` : ''}</div>` +
      `<div class="viewer-bar"><span class="v-count" id="v-count"></span><button class="txt go" id="v-save">⬇️ Save photo</button>${Quests.isParentDevice() ? `<button class="del" id="v-del" aria-label="Delete">🗑️</button>` : ''}</div><div class="v-note" id="v-note"></div></div>`;
    ov.classList.remove('hidden');
    if (typeof Nav !== 'undefined') Nav.pushOverlay();
    const img = ov.querySelector('img'), info = ov.querySelector('#v-info'), count = ov.querySelector('#v-count'), note = ov.querySelector('#v-note'), sv = ov.querySelector('#v-save');
    const HINT = 'Double-tap or pinch the picture to zoom in';
    const closeViewer = () => { ov.classList.add('hidden'); ov.innerHTML = ''; J.viewer = null; J.overlay = null; if (opts && opts.back) opts.back(); };
    J.overlay = { back: () => { closeViewer(); return true; }, kind: 'viewer' };
    let zoom = null;
    const showAt = async (k) => {
      if (!J.viewer) return;
      J.viewer.i = (k + ids.length) % ids.length;
      const m = J.media[ids[J.viewer.i]];
      img.removeAttribute('src'); if (zoom) zoom.reset();
      count.textContent = many ? `${J.viewer.i + 1} of ${ids.length}` : ''; note.textContent = HINT;
      if (!m) { info.textContent = 'That picture is gone.'; sv.disabled = true; return; }
      sv.disabled = false; sv.textContent = m.k === 'drawing' ? '⬇️ Save drawing' : '⬇️ Save photo';
      info.textContent = `${Quests.label(m.p)}${m.d ? ' · ' + fmtDate(m.d) : ''}${m.tag === 'morning' ? ' · morning photo' : m.k === 'drawing' ? ' · drawing' : ''}${m.local ? ' · not backed up yet' : ''}`;
      const u = await Media.url(m.id, kindOf(m));
      if (!J.viewer || J.viewer.ids !== ids || ids[J.viewer.i] !== m.id) return;   // by id: a sync in the meantime rebuilds J.media with new objects (15 Nov 2026; comparing the objects left the picture blank)
      if (u) img.src = u; else note.textContent = 'Not downloaded yet: this picture needs internet.';
    };
    zoom = zoomable(ov.querySelector('#viewer-img'), img, (dir) => { if (many) showAt(J.viewer.i + dir); });
    if (many) { ov.querySelector('#v-prev').onclick = () => showAt(J.viewer.i - 1); ov.querySelector('#v-next').onclick = () => showAt(J.viewer.i + 1); }
    ov.querySelector('#v-close').onclick = closeViewer;
    sv.onclick = async () => {                                               // 2 Nov 2026: the app-size copy out to Downloads (Android) or the share sheet (iOS)
      const m = J.media[ids[J.viewer.i]]; if (!m) return;
      const label = sv.textContent; sv.disabled = true;
      try {
        const how = await Media.saveCopy(m.id, kindOf(m), m);
        sv.textContent = '✓ Saved'; note.textContent = how === 'downloaded' ? 'Saved on this phone: look in Gallery, or Files → Downloads.' : 'Done.';
        setTimeout(() => { if (sv.isConnected !== false) { sv.textContent = label; sv.disabled = false; } }, 2500);
      } catch (e) { sv.disabled = false; if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not save the picture.'); }
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
    showAt(J.viewer.i);
  }

  /* ---------------------------------------------------------------- the composer: a new postcard, or a reply (same overlay, state in J.draft) */
  /* A postcard being written and a reply being written are kept apart (15 Nov 2026): they shared one slot, so opening a reply
     threw away a half-written story and left its pictures belonging to nothing.
     17 Nov 2026: a new postcard is written on the card itself. The composer shows the card of the place (its stamp, its
     paper), the words are typed onto it in the author's handwriting and each picture is glued on as it is added, exactly
     where it will sit on the board (the draft carries the card's id, which decides the tilt of each picture). */
  const slot = (mode) => (mode === 'reply' ? 'replyDraft' : 'storyDraft');
  const hasWork = (dr) => !!(dr && (String(dr.text || '').trim() || (dr.media || []).length));
  function loadDraft(mode) { try { const dr = JSON.parse(localStorage.getItem(slot(mode)) || 'null'); return dr && dr.mode === mode ? dr : null; } catch (e) { return null; } }
  function saveDraft() { try { if (J.draft) localStorage.setItem(slot(J.draft.mode), JSON.stringify(J.draft)); } catch (e) { /* blocked */ } }
  function clearDraft() { const mode = J.draft ? J.draft.mode : null; J.draft = null; try { if (mode) localStorage.removeItem(slot(mode)); } catch (e) { /* blocked */ } }
  function openComposer(opts) {
    opts = opts || {};
    const st = Quests.state(), ctx = currentContext(), mode = opts.mode === 'reply' ? 'reply' : 'post', d = opts.d || ctx.date;
    let dr = J.draft && J.draft.mode === mode ? J.draft : null;
    if (!dr) {
      const saved = loadDraft(mode);
      if (saved && mode === 'post' && (saved.d === d || hasWork(saved))) dr = saved;           // a postcard left half-written comes back, whichever day it was for, until it is posted or thrown away
      else if (saved && mode === 'reply' && saved.postId === opts.postId) dr = saved;
      else if (saved && mode === 'reply') for (const m of saved.media || []) deleteMedia(m.id);   // a reply to another postcard that was never sent: its picture goes with it
    }
    if (!dr) dr = { mode, p: opts.p || st.active, d, postId: opts.postId || null, text: '', mood: '', q: '', media: [] };
    if (!Array.isArray(dr.media)) dr.media = [];
    if (mode === 'post' && !dr.id) dr.id = Media.newId();
    if (!Quests.visiblePlayers().includes(dr.p)) dr.p = st.active;
    J.draft = dr;
    renderComposer();
  }
  const firstLine = (po) => (po.text || '').split('\n')[0].slice(0, 60) || (po.media && po.media.length ? '📷 a picture' : '');
  function mediaThumbs(dr) {
    return dr.media.map((m) => `<div class="th">${pic(m)}<button class="rm" data-rm="${esc(m.id)}" aria-label="Remove">✕</button></div>`).join('');
  }
  function renderComposer() {
    const ov = $('#overlay'), ctx = currentContext(), dr = J.draft, reply = dr.mode === 'reply', grand = Quests.isGrandDevice();
    if (typeof Nav !== 'undefined') Nav.pushOverlay();
    const post = reply ? J.posts[dr.postId] : null, city = cityOf(dr.d, ctx), prompt = reply ? null : promptFor(city, dr.d);
    const players = Quests.visiblePlayers(), max = reply ? 1 : MAX_MEDIA, av = (p) => Quests.face(p, 'av');   // the face (memoised in quests.js)
    const title = reply ? `💬 ${grand ? 'Write back to' : 'Reply to'} ${esc(Quests.label(post ? post.p : ''))}` : (dr.d === ctx.date ? '✏️ New postcard' : `✏️ For ${esc(fmtDate(dr.d))}`);
    const snaps = `<button class="btn" data-snap="camera">📷 Snap</button><button class="btn" data-snap="library">🖼️ Photos</button><button class="btn" id="c-draw">🖍️ Draw</button>`;
    const emoji = `<div class="emoji-bar">` + EMOJI.map((e) => `<button type="button" data-e="${e}" aria-label="${e}">${e}</button>`).join('') + `</div>`;
    let html = `<div class="composer"><div class="pad-bar cbar"><button id="c-cancel" aria-label="Close">✕</button><div class="ctitle">${title}</div><button class="done" id="c-post" disabled>${reply ? 'Send' : 'Post'}</button></div><div class="cbody">`;
    if (players.length > 1) html += `<div class="players">` + players.map((q) => `<button class="player${q === dr.p ? ' active' : ''}" data-pl="${esc(q)}">${av(q)}<span class="nm">${esc(Quests.label(q))}</span></button>`).join('') + `</div>`;
    if (reply) {
      html += `<div class="quote"><b>${esc(Quests.label(post ? post.p : ''))}</b>: ${esc(post ? firstLine(post) : '')}</div>`;
      html += `<textarea class="page-text ctext" id="c-text" maxlength="${MAX_TEXT}" rows="4" placeholder="Say something…">${esc(dr.text || '')}</textarea>${emoji}`;
      html += `<div class="cmedia" id="c-media"></div><div class="row pc-addrow">${snaps}</div>`;
    } else {
      html += `<div class="pc-edit">${Postcard.cardHtml(dr, { ctx, edit: true, media: dr.media, max: MAX_TEXT })}</div>`;
      html += `<div class="row pc-addrow">${snaps}<span class="pc-count" id="c-count"></span></div>`;
      html += `<div class="moods">` + MOODS.map(([id, e, t]) => `<button class="mood${dr.mood === id ? ' on' : ''}" data-mood="${id}"><span class="me">${e}</span><span class="mt">${t}</span></button>`).join('') + `</div>`;
      html += `<button class="chip prompt${dr.q ? ' on' : ''}" id="c-prompt">💭 ${esc(prompt.q)}${dr.q ? ' ✓' : ''}</button>${emoji}`;
    }
    html += `${Media.origHint() ? `<p class="tiny muted">${esc(Media.origHint())}</p>` : ''}</div></div>`;
    ov.innerHTML = html; ov.classList.remove('hidden');
    J.overlay = { back: cancelComposer, kind: 'composer' };
    wireComposer(ov, prompt, max);
    attachViewport(ov);
  }
  function wireComposer(ov, prompt, max) {
    const dr = J.draft, reply = dr.mode === 'reply', ta = ov.querySelector('#c-text'), postBtn = ov.querySelector('#c-post'), paper = ov.querySelector('.pc-paper');
    let busy = 0;                                                        // pictures still being shrunk and sealed: Post waits for them
    const refresh = () => {
      postBtn.disabled = busy > 0 || !hasWork(dr); postBtn.textContent = busy > 0 ? '…' : (reply ? 'Send' : 'Post');
      const n = ov.querySelector('#c-count'); if (n) n.textContent = dr.media.length ? `${dr.media.length} of ${max} pictures on the card` : `Glue on up to ${max} pictures`;
    };
    const grow = () => { if (!reply) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; } };   // the card grows with the words
    const redraw = () => {                                               // the pictures, after one is added or taken off
      if (reply) { const cm = ov.querySelector('#c-media'); if (cm) cm.innerHTML = mediaThumbs(dr); }
      else { const cp = ov.querySelector('#c-photos'); if (cp) cp.innerHTML = Postcard.photosHtml(dr.media, Postcard.themeOf(cityOf(dr.d)), dr.id, { edit: true }); }
      ov.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { const id = b.dataset.rm; dr.media = dr.media.filter((m) => m.id !== id); deleteMedia(id); saveDraft(); redraw(); });
      fillMedia(ov); refresh();
      if (!reply) Postcard.fit(ov.querySelector('.cbody'));
    };
    redraw(); grow();
    if (!reply && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (J.draft === dr && ta.isConnected !== false) grow(); });   // the handwriting font may arrive after the first measure
    ov.querySelectorAll('[data-pl]').forEach((b) => b.onclick = () => {
      dr.p = b.dataset.pl; Quests.setActive(dr.p); ov.querySelectorAll('.player').forEach((x) => x.classList.toggle('active', x === b)); saveDraft();
      if (!reply) { ov.querySelector('#c-sign').innerHTML = Postcard.signHtml(dr); paper.style.setProperty('--hand', `var(--hand-${Postcard.handOf(dr.p)})`); grow(); }   // the card is signed, and written, by whoever is picked
    });
    ov.querySelectorAll('[data-mood]').forEach((b) => b.onclick = () => { dr.mood = dr.mood === b.dataset.mood ? '' : b.dataset.mood; ov.querySelectorAll('.mood').forEach((x) => x.classList.toggle('on', x.dataset.mood === dr.mood)); ov.querySelector('#c-sign').innerHTML = Postcard.signHtml(dr); FX.haptic(15); saveDraft(); });
    const pr = ov.querySelector('#c-prompt');
    if (pr) pr.onclick = () => { dr.q = dr.q ? '' : prompt.q; pr.classList.toggle('on', !!dr.q); pr.textContent = '💭 ' + prompt.q + (dr.q ? ' ✓' : ''); const q = ov.querySelector('#c-q'); q.textContent = dr.q; q.classList.toggle('hidden', !dr.q); saveDraft(); ta.focus(); };
    let timer = null;
    ta.oninput = () => { dr.text = ta.value.slice(0, MAX_TEXT); grow(); refresh(); clearTimeout(timer); timer = setTimeout(saveDraft, 300); };
    ov.querySelectorAll('[data-e]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();                       // keep the keyboard and the caret where they are
      b.onclick = () => {
        const e = b.dataset.e; if (ta.value.length + e.length > MAX_TEXT) return;
        const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, en = ta.selectionEnd == null ? s : ta.selectionEnd;
        try { ta.setRangeText(e, s, en, 'end'); } catch (err) { ta.value += e; }
        ta.dispatchEvent(new Event('input')); ta.focus();
      };
    });
    const full = () => { alert(max === 1 ? 'A reply carries one picture.' : `A postcard holds up to ${max} pictures.`); };
    ov.querySelectorAll('[data-snap]').forEach((b) => b.onclick = () => {
      const left = max - dr.media.length; if (left <= 0) return full();
      let counted = false;                                               // busy only from the moment pictures actually arrive (see addPhotos)
      addPhotos(dr.p, dr.d, 'story', b.dataset.snap === 'camera', left, () => { counted = true; busy++; refresh(); }).then((ids) => {
        for (const id of ids) dr.media.push({ id, k: 'photo' });
        saveDraft(); if (J.draft === dr && ov.querySelector('#c-post') === postBtn) redraw();
      }).catch((e) => { if (window.logErr) logErr('add photos: ' + ((e && e.message) || e)); }).then(() => { if (counted) busy--; refresh(); });
    });
    ov.querySelector('#c-draw').onclick = () => {
      if (dr.media.length >= max) return full();
      openDraw(dr.p, dr.d, 'story').then((id) => { if (id) { dr.media.push({ id, k: 'drawing' }); saveDraft(); } if (J.draft) renderComposer(); });   // the pad borrows the overlay; the composer comes back from J.draft
    };
    ov.querySelector('#c-cancel').onclick = cancelComposer;
    postBtn.onclick = async () => {
      postBtn.disabled = true;
      try {
        if (reply) await addComment(dr.postId, dr); else await addPost(dr);
        closeComposer(true);
      } catch (e) { postBtn.disabled = false; alert((e && e.message) || 'Could not post.'); }
    };
  }
  function cancelComposer() {
    const dr = J.draft;
    if (dr && (String(dr.text || '').trim() || dr.media.length) && !confirm(dr.mode === 'reply' ? 'Throw this reply away?' : 'Throw this postcard away?')) return false;
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

  /* ---------------------------------------------------------------- the board: every postcard, newest first
     17 Nov 2026. A day with something on it gets a dashed line with its date and place, the day's loose photos (the
     morning photos) as little prints, then its postcards. Each postcard is the card (postcard.js) and, under it, a small
     panel: the quick emoji with how many, who tapped them, the replies, and one button to write back. The board draws the
     newest few cards and offers the older ones on a button. The same on every device; Grandma and Grandpa's phone has no
     writing, sending or deleting, and larger buttons (styles.css). */
  function timeOf(po, ctx) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: tzOf(cityOf(po.d, ctx)), hour: '2-digit', minute: '2-digit' }).format(new Date(po.t || 0)); } catch (e) { return ''; }
  }
  function pic(m) { return `<img class="${m.k === 'drawing' ? 'dr' : 'ph'}" data-oid="${esc(m.k === 'drawing' ? m.id : m.id + 't')}" data-kind="${m.k === 'drawing' ? 'drawing' : 'thumb'}" alt="">`; }
  const isNewCard = (po, st) => J.newSince > 0 && !po.legacy && po._d !== st.device && po._t > J.newSince;   // arrived since this device last looked; nothing is "new" on the very first visit
  function ordered() {                    // the postcards in the order the board shows them: newest day first, and within a day the newest card first
    return Object.values(J.posts).filter((po) => po.d).sort((a, b) => (a.d === b.d ? (b.t || 0) - (a.t || 0) : (a.d < b.d ? 1 : -1)));
  }
  function panelHtml(po, st, ro, cards) {
    const cm = J.cmts[po.id] || [], reacts = cm.filter((c) => !c.media && isEmojiOnly(c.text)), replies = cm.filter((c) => !reacts.includes(c)), by = {};
    for (const r of reacts) { const e = r.text.trim(); (by[e] = by[e] || []).push(r); }
    const emojis = QUICK.concat(Object.keys(by).filter((e) => !QUICK.includes(e)));
    let h = `<div class="pc-panel"><div class="pc-rx">` + emojis.map((e) => {
      const rs = by[e] || [], mine = rs.some((r) => r.p === st.active);
      return `<button type="button" class="rx${mine ? ' on' : ''}" data-quick="${esc(po.id)}|${esc(e)}" aria-pressed="${mine}" aria-label="${esc(e)}${rs.length ? ' ' + rs.length : ''}"><span class="e">${esc(e)}</span>${rs.length ? `<span class="n">${rs.length}</span>` : ''}</button>`;
    }).join('') + `</div>`;
    const who = Object.entries(by).map(([e, rs]) => `${esc(e)} ${[...new Set(rs.map((r) => Quests.label(r.p)))].map(esc).join(', ')}`);
    if (who.length) h += `<div class="pc-who">${who.join(' · ')}</div>`;
    if (replies.length) h += `<div class="pc-cmts">${replies.map((c) => `<div class="pc-cmt">${Quests.face(c.p)}<div class="bub"><b>${esc(Quests.label(c.p))}</b>${esc(c.text || '')}${c.media && J.media[c.media.id] ? `<button class="phbtn" data-view="${esc(c.media.id)}" aria-label="Open the picture">${pic(c.media)}</button>` : ''}</div>${canDelete(c, st) ? `<button class="xdel" data-del-cmt="${esc(po.id)}|${esc(c.id)}" aria-label="Delete reply">🗑️</button>` : ''}</div>`).join('')}</div>`;
    h += `<button type="button" class="pc-say" data-reply="${esc(po.id)}">💬 ${ro ? 'Write back' : 'Write a reply…'}</button>`;
    if (!ro) {
      const seen = (J.seen[po.id] || []).map((p) => Quests.label(p)), cs = cards && cards[po.id];
      if (seen.length) h += `<div class="pc-seen">👀 Seen by ${esc(seen.join(' and '))}</div>`;
      h += `<div class="pc-tools">${cs ? (cs.sent ? '<span class="chip pc">📮 sent</span>' : cs.pending ? '<span class="chip pc">📮 waiting for Mum or Dad</span>' : '') : ''}<button class="btn small-btn" data-card="${esc(po.id)}">📤 Send</button>${canDelete(po, st) ? `<button class="btn small-btn del" data-del-post="${esc(po.id)}" aria-label="Delete postcard">🗑️</button>` : ''}</div>`;
    }
    return h + `</div>`;
  }
  function cardBlock(po, st, ctx, ro, cards) {
    const media = (po.media || []).filter((m) => J.media[m.id]);
    return `<article class="pcard" data-post="${esc(po.id)}">${Postcard.cardHtml(po, { ctx, media, isNew: isNewCard(po, st) })}${panelHtml(po, st, ro, cards)}</article>`;
  }
  function albumHtml(ctx, count) {        // the stamp album: a stamp for every place on the trip, in colour once a postcard has come from there; tap one to jump to it
    const order = [];
    for (const d of S.family.days) { const c = Quests.dayCity(d); if (c !== 'Air' && c !== 'Home' && !order.includes(c)) order.push(c); }
    for (const c of Object.keys(count)) if (!order.includes(c)) order.push(c);   // home, the air, or anywhere the plan does not list
    if (!order.length) return '';
    const got = order.filter((c) => count[c]).length;
    return `<div class="pc-album-h">Stamp album · ${got} of ${order.length} places</div><div class="pc-album">${order.map((c) => `<button type="button" class="${count[c] ? '' : 'none'}" data-city="${esc(c)}"${count[c] ? '' : ' disabled'} aria-label="${esc(c)}: ${count[c] || 'no'} postcard${count[c] === 1 ? '' : 's'}">${Postcard.stampHtml(c)}${count[c] ? `<span class="cnt">${count[c]}</span>` : ''}</button>`).join('')}</div>`;
  }
  function boardHtml() {
    const ctx = currentContext(), F = S.family, st = Quests.state(), ro = Quests.isGrandDevice();
    const used = usedMediaIds(), cards = Quests.cardStatuses ? Quests.cardStatuses(st) : {}, days = {}, count = {};
    const dayAt = (d) => (days[d] = days[d] || { posts: [], loose: [] });
    const all = ordered();
    for (const po of all) { dayAt(po.d).posts.push(po); const c = cityOf(po.d, ctx); count[c] = (count[c] || 0) + 1; }
    for (const m of index()) if (m.d && m.k === 'photo' && m.tag !== 'story' && !used.has(m.id)) dayAt(m.d).loose.push(m);   // the morning photos and the like
    const dates = Object.keys(days).sort().reverse(), fresh = all.filter((po) => isNewCard(po, st));
    const badgeDates = {};
    for (const b of Quests.badges(Quests.view(st, st.active), ctx)) { const on = b.opens || b.on; if (b.earned && on && (b.kind === 'stamp' || b.kind === 'milestone')) (badgeDates[on] = badgeDates[on] || []).push(b); }
    let html = `<h1 class="h1">💌 Postcards</h1>`;
    if (!ro) html += `<button class="btn primary block new-story" data-new="${esc(ctx.date)}">✏️ Write a postcard</button>`;   // Grandma and Grandpa's phone: no "I'm Grandma" pills (3 Nov 2026); a ❤️ or a reply there is from both of them
    if (J.error) html += `<div class="card red"><b>Could not open the postcards.</b><div class="small">${esc(J.error)}</div><div class="small">Tell Andy what it says, then try Settings → Sync now.</div></div>`;
    if (fresh.length) html += `<button type="button" class="pc-mail" data-jump="${esc(fresh[0].id)}"><span class="e">📬</span><span>${fresh.length} new postcard${fresh.length === 1 ? '' : 's'}${ro ? ' for you!' : '!'}<small>From ${esc([...new Set(fresh.map((po) => Quests.label(po.p)))].join(', '))}</small></span></button>`;
    const o = Media.originalsSummary();
    if (!ro && Media.canSaveOriginals() && o.waiting) html += `<div class="card originals"><b>📥 ${o.waiting} full-size photo${o.waiting === 1 ? '' : 's'} not yet in Photos</b> <span class="muted small">(${(o.waitingBytes / 1048576).toFixed(1)} MB)</span><div class="row"><button class="btn" id="orig-save">Save to Photos</button></div><div class="tiny muted">One tap saves up to ${Media.LIMITS.shareBatch} at a time. Then Photos has the originals and the app keeps the small copies.</div></div>`;
    html += albumHtml(ctx, count);
    let shown = 0, more = false;
    for (const date of dates) {
      if (shown >= J.limit) { more = true; break; }
      const g = days[date], day = dayOf(date), city = cityOf(date, ctx);
      const moves = (F.moves || []).filter((m) => m.date === date), stamps = badgeDates[date] || [];
      html += `<div class="pc-day" data-date="${esc(date)}"><span class="lbl">${Quests.CITY_EMOJI[city] || '📍'} ${esc(fmtDate(date))}${date === ctx.date ? ' · today' : ''}<small>${esc(day ? day.where : (city === 'Home' ? 'At home' : city))}</small></span></div>`;
      if (moves.length || stamps.length) html += `<div class="pc-dayx">${moves.map((m) => `<div>${moveGlyph(m.mode)} ${esc(m.frm)} → ${esc(m.to)}</div>`).join('')}${stamps.map((b) => `<span class="sticker">${b.e} ${esc(b.t)}</span>`).join('')}</div>`;
      if (g.loose.length) html += `<div class="pc-loose">${g.loose.sort((a, b) => (a.t || 0) - (b.t || 0)).map((m) => `<button type="button" data-view="${esc(m.id)}" data-group="${esc(date)}" aria-label="Open the photo"><img data-oid="${esc(m.id)}t" data-kind="thumb" alt=""></button>`).join('')}<div class="cap">📸 ${g.loose.every((m) => m.tag === 'morning') ? 'The morning photos' : 'Photos of the day'}</div></div>`;
      for (const po of g.posts) { html += cardBlock(po, st, ctx, ro, cards); shown++; }
    }
    if (more) html += `<button class="btn block" id="pc-more">Show older postcards</button>`;
    if (!dates.length) html += `<div class="pc-empty"><div class="e">📭</div>${ro ? 'No postcards yet. They land here once the family writes one and this phone syncs.' : 'No postcards yet. Tap ✏️ Write a postcard.'}</div>`;
    if (!ro) html += `<div class="pc-add"><button class="btn small-btn" id="pc-otherday">📅 Write a postcard for another day</button></div>`;
    return html;
  }
  function renderStory() { const r = guarded($('#screen-story'), '💌 Postcards', renderStoryInner); if (r === null) J.html = null; return r; }
  function renderStoryInner() {
    const el = $('#screen-story');
    if (!Media.enabled) { J.html = null; el.innerHTML = `<h1 class="h1">💌 Postcards</h1><div class="card">Postcards and photos need a full rebuild of the app: this build has no media key.</div>`; return; }
    if (!J.warmed) { J.html = null; el.innerHTML = `<h1 class="h1">💌 Postcards</h1><p class="muted">Opening the postcards…</p>`; warm(); return; }
    if (J.newSince == null) J.newSince = +(localStorage.getItem('storiesSeen') || 0);   // fixed for this visit: the cards that came since the last one keep their New! flag until the board is left
    const html = boardHtml();
    if (html === J.html && el.firstChild) { markSeen(); refreshBadge(); return; }       // nothing on the board changed (a sync, a seen mark): leave it and its pictures alone
    J.html = html;
    const y = window.scrollY;
    el.innerHTML = html;
    window.scrollTo(0, y);
    wireBoard(el);
    Postcard.fit(el);
    if (!J.fitOn) { J.fitOn = true; window.addEventListener('resize', () => { if (S.screen === 'story') Postcard.fit($('#screen-story')); const cb = document.querySelector('#overlay .cbody'); if (cb) Postcard.fit(cb); }); }
    if (Media.canSaveOriginals() && Media.originalsSummary().waiting) Media.prepareOriginals();
    observe(el);
    markSeen(); refreshBadge();
  }
  function wirePanel(root) {              // the buttons of the panels in `root` (the whole board, or one panel just redrawn)
    root.querySelectorAll('[data-reply]').forEach((b) => b.onclick = () => openComposer({ mode: 'reply', postId: b.dataset.reply, d: (J.posts[b.dataset.reply] || {}).d }));
    root.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => { if (window.Postcard) Postcard.openPreview(b.dataset.card); });
    root.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => react(b.dataset.quick));
    root.querySelectorAll('[data-del-post]').forEach((b) => b.onclick = () => { if (confirm('Delete this postcard for everyone?')) deletePost(b.dataset.delPost).then(() => renderStory()); });
    root.querySelectorAll('[data-del-cmt]').forEach((b) => b.onclick = () => { const [postId, id] = b.dataset.delCmt.split('|'); if (confirm('Delete this reply for everyone?')) { const done = deleteComment(postId, id); refreshPanel(postId); done.then(() => renderStory()); } });
  }
  function react(key) {                   // a tap on a quick emoji: on, or off again. The panel changes at once; the fact follows.
    const st = Quests.state(), cut = key.indexOf('|'), postId = key.slice(0, cut), e = key.slice(cut + 1);
    const mine = (J.cmts[postId] || []).find((c) => c.p === st.active && !c.media && c.text.trim() === e);
    const done = mine ? deleteComment(postId, mine.id) : addComment(postId, { p: st.active, text: e, media: null });
    refreshPanel(postId);
    const b = [...document.querySelectorAll('#screen-story [data-quick]')].find((x) => x.dataset.quick === key); if (b) FX.pulse(b, 'bump', 600);
    done.catch((err) => { if (window.logErr) logErr('react: ' + ((err && err.message) || err)); }).then(() => { if (S.screen === 'story' && !composerOpen()) renderStory(); });
  }
  function refreshPanel(postId) {         // one card's panel again, without touching the rest of the board
    const card = [...document.querySelectorAll('#screen-story .pcard')].find((c) => c.dataset.post === postId), po = J.posts[postId];
    const old = card && card.querySelector('.pc-panel'); if (!old || !po) return;
    const st = Quests.state(), tmp = document.createElement('div');
    tmp.innerHTML = panelHtml(po, st, Quests.isGrandDevice(), Quests.cardStatuses ? Quests.cardStatuses(st) : {});
    const neu = tmp.firstChild; card.replaceChild(neu, old);
    wirePanel(neu); fill(neu);
    J.html = boardHtml();                 // what the board shows now, so the redraw that follows the fact finds nothing to do
  }
  function jumpTo(postId) {               // bring a card onto the board (it may be among the older ones) and scroll to it
    const i = ordered().findIndex((po) => po.id === postId); if (i < 0) return;
    if (i >= J.limit) { J.limit = i + PAGE; renderStory(); }
    setTimeout(() => { const c = [...document.querySelectorAll('#screen-story .pcard')].find((x) => x.dataset.post === postId); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }
  function pickDay() {                    // a postcard for a day that has gone by: any day of the trip so far
    const ctx = currentContext(), F = S.family, list = [];
    for (let d = ctx.date < F.trip.end ? ctx.date : F.trip.end; d >= F.trip.start && list.length < 60; d = Quests.addDays(d, -1)) list.push(d);
    if (ctx.date < F.trip.start) list.push(ctx.date);
    openModal(`<h2 class="h2">📅 Which day is the postcard for?</h2><div class="pc-days">${list.map((d) => { const c = cityOf(d, ctx); return `<button class="day${d === ctx.date ? ' today' : ''}" data-d="${esc(d)}"><span class="de">${Quests.CITY_EMOJI[c] || '📍'}</span><span class="dn">${+d.slice(8, 10)}</span><span class="dw">${esc(fmtDate(d).slice(-3))}</span></button>`; }).join('')}</div>`);
    $('#modal-inner').querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { closeModal(); openComposer({ mode: 'post', d: b.dataset.d }); });
  }
  function wireBoard(el) {
    const st = Quests.state();
    wireViews(el); wirePanel(el);
    el.querySelectorAll('[data-new]').forEach((b) => b.onclick = () => openComposer({ mode: 'post', d: b.dataset.new }));
    el.querySelectorAll('[data-jump]').forEach((b) => b.onclick = () => jumpTo(b.dataset.jump));
    el.querySelectorAll('[data-city]').forEach((b) => b.onclick = () => { const ctx = currentContext(), po = ordered().find((x) => cityOf(x.d, ctx) === b.dataset.city); if (po) jumpTo(po.id); });
    const more = el.querySelector('#pc-more'); if (more) more.onclick = () => { J.limit += PAGE; renderStory(); };
    const other = el.querySelector('#pc-otherday'); if (other) other.onclick = pickDay;
    const os = el.querySelector('#orig-save');
    if (os) os.onclick = () => { os.disabled = true; Media.saveOriginals().then((r) => { if (r.saved) Quests.celebrate('📥', `Saved ${r.saved} to Photos`, r.left ? `${r.left} more to go: tap again` : 'All your full-size photos are in Photos', st.active, 'ok'); J.html = null; renderStory(); }).catch((e) => { os.disabled = false; if (e && e.name !== 'AbortError') alert(e.message || 'Could not hand the photos over.'); }); };
  }
  function observe(root) {               // thumbnails decrypt only near the viewport and let go again when far away
    if (J.observer) J.observer.disconnect();
    if (J.watcher) { J.watcher.disconnect(); J.watcher = null; }
    for (const t of Object.values(J.reading || {})) clearTimeout(t);
    J.reading = {};
    J.observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const img = en.target;
        if (en.isIntersecting) { if (!img.src) loadImg(img); }
        else if (img.src) { img.removeAttribute('src'); delete img.dataset.sharp; }
      }
    }, { rootMargin: '600px 0px' });
    root.querySelectorAll('img[data-oid]').forEach((img, i) => {
      if (i < 12) loadImg(img);                                          // the first screenful at once; the observer handles the rest
      J.observer.observe(img);
    });
    if (!Quests.isGrandDevice()) return;
    J.watcher = new IntersectionObserver((entries) => {                  // Grandma and Grandpa's phone: the words of a card on screen for a second and a half = seen
      for (const en of entries) {
        const card = en.target.closest('.pcard'), id = card && card.dataset.post; if (!id) continue;
        if (!en.isIntersecting) { clearTimeout(J.reading[id]); delete J.reading[id]; }
        else if (!J.reading[id]) J.reading[id] = setTimeout(() => { delete J.reading[id]; if (S.screen === 'story' && !document.hidden) markCardSeen(id); }, 1500);
      }
    }, { threshold: 0.6 });
    root.querySelectorAll('.pcard .pc-msg').forEach((m) => J.watcher.observe(m));
  }
  function onLeave(screen) {
    if (screen !== 'story') return;
    if (J.observer) { J.observer.disconnect(); J.observer = null; }
    if (J.watcher) { J.watcher.disconnect(); J.watcher = null; }
    for (const t of Object.values(J.reading || {})) clearTimeout(t);
    J.reading = {}; J.html = null; J.newSince = null; J.limit = PAGE;     // the next visit starts at the top, draws afresh (the pictures below are let go) and counts what is new from now
    if (window.Postcard) Postcard.releaseUrls();
    Media.release();
  }
  /* for the globe (2 Nov 2026): jump to a day's postcards, and a city's numbers for the badge popup */
  function scrollToDate(d) {
    const go = () => {
      const list = ordered(), i = list.findIndex((po) => po.d <= d);     // the day may be among the older cards: draw down to it first
      if (i >= J.limit) { J.limit = i + PAGE; renderStory(); }
      setTimeout(() => { const all = [...document.querySelectorAll('#screen-story .pc-day')], c = all.find((x) => x.dataset.date === d) || all.find((x) => x.dataset.date < d); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
    };
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
      await Media.ensure(m.id, kindOf(m));
      done += 2; if (onProgress) onProgress(Math.min(done, total), total);
    }
  }

  return { init, warm, page, promptFor, index, storiesTileHtml, morningHtml, fill, thumb: pic, renderStory, openComposer, openDraw, openViewer, onLeave, addPhoto, addPhotos, downloadAll, refreshBadge, post, cityOf,
    media: (id) => J.media[id] || null, timeOf,
    overlayOpen: () => !!J.overlay, overlayBack: () => (J.overlay ? J.overlay.back() : true), diag, scrollToDate, cityStats };
})();
