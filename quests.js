/* Travel Dossier quests: badges, points and levels for the kids (and the grown-ups), 31 Oct 2026.
   Progress lives only on this device (localStorage), so the iPad and each phone keep their own scores: the iPad is
   the kids' scoreboard. Nothing here is secret and nothing names the 5 January plan beyond the family wording.
   Loaded before app.js; it only touches app.js helpers ($, esc, fmtDate, currentContext, show, openModal) at call time. */
'use strict';
window.Quests = (() => {
  const KEY = 'quests:v1';
  const CITY_EMOJI = { Home: '🏡', Vancouver: '🌲', Whistler: '⛄', Toronto: '🍁', 'New York': '🗽', 'Montréal': '🏒', Montreal: '🏒', Tokyo: '🗼', Nagoya: '🧱', Air: '✈️' };
  const CITY_KEY = { Home: 'home', Vancouver: 'vancouver', Whistler: 'whistler', Toronto: 'toronto', 'New York': 'newyork', 'Montréal': 'montreal', Montreal: 'montreal', Tokyo: 'tokyo', Nagoya: 'nagoya', Air: 'air' };
  const CITIES = ['Vancouver', 'Whistler', 'Toronto', 'New York', 'Montréal', 'Tokyo', 'Nagoya'];
  const AVATARS = ['🦖', '🦄', '🐼', '🦊', '🐨', '🐯', '🦁', '🐸', '🦋', '🐙', '🚀', '🌟', '🎸', '🧙', '🦸', '🕵️'];
  const DEFAULT_AVATAR = { Andrew: '🕵️', Sarah: '🌟', Vince: '🦖', Drew: '🦄' };
  const DISPLAY = { Andrew: 'Dad', Sarah: 'Mum' };
  const LEVELS = [[0, 'Rookie', '🥾'], [100, 'Explorer', '🧭'], [250, 'Adventurer', '🎒'], [500, 'Navigator', '🧭'], [900, 'Globetrotter', '🌏'], [1500, 'Legend', '👑']];
  const FOOD_PTS = 10;

  /* kind: food · explore · helper · words · travel · daily. where: a city, 'any' (whole trip), 'home' (before we go). */
  const QUESTS = [
    // before we go
    { id: 'pack-case', e: '🧳', t: 'Help pack your own suitcase', pts: 20, where: 'home', kind: 'helper' },
    { id: 'flu-shot', e: '💉', t: 'Brave the flu shot', pts: 30, where: 'home', kind: 'helper' },
    { id: 'learn-ja', e: '🇯🇵', t: 'Learn three Japanese words', pts: 20, where: 'home', kind: 'words' },
    { id: 'learn-fr', e: '🇫🇷', t: 'Learn three French words', pts: 20, where: 'home', kind: 'words' },
    { id: 'know-numbers', e: '📱', t: "Know Mum and Dad's phone numbers by heart", pts: 50, where: 'any', kind: 'helper' },
    { id: 'thermals', e: '🧤', t: 'Try on your thermals and gloves', pts: 10, where: 'home', kind: 'helper' },
    // every day, anywhere
    { id: 'photo', e: '📸', t: 'Morning photo taken (grown-ups)', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'daypack', e: '🎒', t: 'Pack your own daypack', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'hands', e: '🤝', t: 'Hold hands at every crossing and station', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'thanks', e: '🙏', t: 'Say thank you in the local language', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'water', e: '💧', t: 'Drink water before bed', pts: 5, where: 'any', kind: 'daily', daily: true },
    // travel days
    { id: 'first-flight', e: '🛫', t: 'Take off on the first flight', pts: 30, where: 'any', kind: 'travel' },
    { id: 'window', e: '🪟', t: 'Spot mountains or clouds from the window seat', pts: 10, where: 'any', kind: 'travel' },
    { id: 'carousel', e: '🧳', t: 'Spot our bags on the carousel first', pts: 10, where: 'any', kind: 'travel' },
    { id: 'passport', e: '🛂', t: 'Carry your own passport through immigration', pts: 20, where: 'any', kind: 'travel' },
    { id: 'sleep-plane', e: '😴', t: 'Sleep on a plane', pts: 20, where: 'any', kind: 'travel' },
    { id: 'taxi-card', e: '🚕', t: 'Show a taxi card to a driver', pts: 15, where: 'any', kind: 'helper' },
    { id: 'rally', e: '📍', t: 'Find the meeting point at a big venue', pts: 15, where: 'any', kind: 'helper' },
    // Vancouver
    { id: 'seawall', e: '🌊', t: 'Walk the seawall', pts: 20, where: 'Vancouver', kind: 'explore' },
    { id: 'totem', e: '🗿', t: 'Spot a totem pole', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'science-world', e: '🔬', t: 'See the Science World dome', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'canada-line', e: '🚆', t: 'Ride the Canada Line', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'nanaimo', e: '🍫', t: 'Eat a Nanaimo bar', pts: 15, where: 'Vancouver', kind: 'food' },
    { id: 'seaplane', e: '🛩️', t: 'Watch a sea plane take off', pts: 10, where: 'Vancouver', kind: 'explore' },
    { id: 'aquarium', e: '🐙', t: 'Find an octopus at the aquarium', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'capilano', e: '🌉', t: 'Cross the Capilano bridge', pts: 25, where: 'Vancouver', kind: 'explore' },
    // Whistler
    { id: 'gondola', e: '🚡', t: 'Ride the Peak 2 Peak gondola', pts: 25, where: 'Whistler', kind: 'explore' },
    { id: 'tubing', e: '🛷', t: 'Go snow tubing', pts: 25, where: 'Whistler', kind: 'explore' },
    { id: 'snowman', e: '⛄', t: 'Build a snowman', pts: 20, where: 'Whistler', kind: 'explore' },
    { id: 'snowflake', e: '❄️', t: 'Catch a snowflake on your tongue', pts: 10, where: 'Whistler', kind: 'explore' },
    { id: 'cocoa', e: '☕', t: 'Hot chocolate by a fire', pts: 10, where: 'Whistler', kind: 'food' },
    { id: 'snow-angel', e: '👼', t: 'Make a snow angel', pts: 10, where: 'Whistler', kind: 'explore' },
    { id: 'lumina', e: '✨', t: 'Walk the Vallea Lumina lights', pts: 20, where: 'Whistler', kind: 'explore' },
    // Toronto
    { id: 'cn-tower', e: '🗼', t: 'Go up the CN Tower', pts: 25, where: 'Toronto', kind: 'explore' },
    { id: 'glass-floor', e: '🫣', t: 'Stand on the glass floor', pts: 20, where: 'Toronto', kind: 'explore' },
    { id: 'dino', e: '🦕', t: 'Find the biggest dinosaur at the ROM', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'raccoon', e: '🦝', t: 'Spot a raccoon (Toronto\'s unofficial mascot)', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'streetcar', e: '🚋', t: 'Ride a streetcar', pts: 10, where: 'Toronto', kind: 'explore' },
    { id: 'peameal', e: '🥪', t: 'Eat a peameal bacon sandwich', pts: 15, where: 'Toronto', kind: 'food' },
    { id: 'raptors', e: '🏀', t: 'Cheer at a Raptors game', pts: 25, where: 'Toronto', kind: 'explore' },
    { id: 'niagara', e: '🌈', t: 'See Niagara Falls lit up', pts: 30, where: 'Toronto', kind: 'explore' },
    { id: 'eh', e: '🍁', t: 'Say "eh" to a Canadian', pts: 10, where: 'Toronto', kind: 'words' },
    { id: 'zoo', e: '🐧', t: 'Find the penguins at the zoo', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'beavertail', e: '🦫', t: 'Eat a BeaverTail pastry', pts: 15, where: 'Toronto', kind: 'food' },
    // New York
    { id: 'rink', e: '⛸️', t: 'Skate at Rockefeller Center', pts: 30, where: 'New York', kind: 'explore' },
    { id: 'big-tree', e: '🎄', t: 'See the giant Christmas tree', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'central-park', e: '🌳', t: 'Walk through Central Park', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'pizza', e: '🍕', t: 'Fold a New York pizza slice', pts: 15, where: 'New York', kind: 'food' },
    { id: 'subway', e: '🚇', t: 'Ride the subway', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'yellow-cab', e: '🚖', t: 'Ride in a yellow cab', pts: 10, where: 'New York', kind: 'explore' },
    { id: 'pretzel', e: '🥨', t: 'Hot pretzel from a street cart', pts: 10, where: 'New York', kind: 'food' },
    { id: 'times-square', e: '🌃', t: 'Count ten screens in Times Square', pts: 10, where: 'New York', kind: 'explore' },
    { id: 'nintendo', e: '🎮', t: 'Visit Nintendo New York', pts: 15, where: 'New York', kind: 'explore' },
    // Montréal
    { id: 'bonjour', e: '👋', t: 'Say bonjour to someone', pts: 10, where: 'Montréal', kind: 'words' },
    { id: 'order-fr', e: '🗣️', t: 'Order something in French', pts: 25, where: 'Montréal', kind: 'words' },
    { id: 'poutine', e: '🍟', t: 'Eat poutine', pts: 15, where: 'Montréal', kind: 'food' },
    { id: 'bagel', e: '🥯', t: 'Try a Montréal bagel', pts: 15, where: 'Montréal', kind: 'food' },
    { id: 'biodome', e: '🐧', t: 'See the penguins at the Biodôme', pts: 20, where: 'Montréal', kind: 'explore' },
    { id: 'habs', e: '🏒', t: 'Cheer at the hockey', pts: 25, where: 'Montréal', kind: 'explore' },
    { id: 'old-montreal', e: '🏰', t: 'Walk Old Montréal in the snow', pts: 15, where: 'Montréal', kind: 'explore' },
    { id: 'taffy', e: '🍁', t: 'Maple taffy on snow', pts: 15, where: 'Montréal', kind: 'food' },
    { id: 'merci', e: '🙏', t: 'Say merci ten times in a day', pts: 10, where: 'Montréal', kind: 'words' },
    // Tokyo
    { id: 'arigato', e: '🙇', t: 'Say arigatō and bow back', pts: 10, where: 'Tokyo', kind: 'words' },
    { id: 'suica', e: '💳', t: 'Tap through a ticket gate with a Suica', pts: 15, where: 'Tokyo', kind: 'explore' },
    { id: 'vending', e: '🥤', t: 'Buy a drink from a vending machine', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'sushi-train', e: '🍣', t: 'Eat at a conveyor-belt sushi place', pts: 20, where: 'Tokyo', kind: 'food' },
    { id: 'shrine', e: '⛩️', t: 'Visit a shrine for hatsumōde', pts: 20, where: 'Tokyo', kind: 'explore' },
    { id: 'skytree', e: '🗼', t: 'Go up Tokyo Skytree', pts: 25, where: 'Tokyo', kind: 'explore' },
    { id: 'fukubukuro', e: '🎁', t: 'Open a fukubukuro lucky bag', pts: 20, where: 'Tokyo', kind: 'explore' },
    { id: 'koban', e: '👮', t: 'Find a kōban (police box)', pts: 15, where: 'Tokyo', kind: 'helper' },
    { id: 'onigiri', e: '🍙', t: 'Onigiri from a konbini', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'soba', e: '🍜', t: 'Toshikoshi soba on New Year\'s Eve', pts: 20, where: 'Tokyo', kind: 'food' },
    { id: 'taiyaki', e: '🐟', t: 'Eat a taiyaki', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'slurp', e: '🍥', t: 'Slurp ramen (loudly is polite)', pts: 15, where: 'Tokyo', kind: 'food' },
    { id: 'shoes', e: '🥿', t: 'Shoes off at the door, every time', pts: 10, where: 'Tokyo', kind: 'helper' },
    { id: 'arcade', e: '🕹️', t: 'One go in an Akihabara arcade', pts: 15, where: 'Tokyo', kind: 'explore' },
    { id: 'teamlab', e: '🌌', t: 'Walk through the water at teamLab', pts: 25, where: 'Tokyo', kind: 'explore' },
    { id: 'shinkansen', e: '🚅', t: 'Ride the Shinkansen', pts: 30, where: 'Tokyo', kind: 'travel' },
    { id: 'kitkat', e: '🍵', t: 'Try a weird KitKat flavour', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'sensoji', e: '🏮', t: 'Walk under the big lantern at Sensō-ji', pts: 15, where: 'Tokyo', kind: 'explore' },
    // Nagoya day trip
    { id: 'legoland', e: '🧱', t: 'Build something at LEGOLAND', pts: 25, where: 'Nagoya', kind: 'explore' },
    { id: 'ekiben', e: '🍱', t: 'Eat an ekiben on the train', pts: 15, where: 'Nagoya', kind: 'food' },
  ];

  /* ---------------------------------------------------------------- state */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '') || {}; } catch (e) { return {}; }
  }
  function save(st) { localStorage.setItem(KEY, JSON.stringify(st)); }
  function people() { return ((typeof S !== 'undefined' && S.family && S.family.trip && S.family.trip.people) || ['Andrew', 'Sarah', 'Vince', 'Drew']).slice(); }
  function state() {
    const st = load();
    st.players = st.players || {};
    for (const p of people()) st.players[p] = st.players[p] || { avatar: DEFAULT_AVATAR[p] || '🙂', done: {}, foods: [], seen: {} };
    if (!st.active || !st.players[st.active]) st.active = people().find((p) => !DISPLAY[p]) || people()[0];
    return st;
  }
  const label = (p) => DISPLAY[p] || p;
  function setActive(p) { const st = state(); st.active = p; save(st); }
  function setAvatar(p, a) { const st = state(); st.players[p].avatar = a; save(st); }
  function reset() { localStorage.removeItem(KEY); }
  const byId = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

  function doneCount(pl, id) { return (pl.done[id] || []).length; }
  function doneToday(pl, id, date) { return (pl.done[id] || []).includes(date); }
  function points(pl) {
    let pts = 0;
    for (const [id, dates] of Object.entries(pl.done)) pts += (byId[id] ? byId[id].pts : 0) * dates.length;
    pts += (pl.foods || []).length * FOOD_PTS;
    for (const b of badges(pl)) if (b.earned) pts += b.pts;
    return pts;
  }
  function level(pts) {
    let cur = LEVELS[0], next = null;
    for (const l of LEVELS) { if (pts >= l[0]) cur = l; else { next = l; break; } }
    return { name: cur[1], emoji: cur[2], from: cur[0], next: next ? next[0] : null, nextName: next ? next[1] : null,
      pct: next ? Math.round(((pts - cur[0]) / (next[0] - cur[0])) * 100) : 100 };
  }
  function complete(player, id, date) {
    const st = state(), pl = st.players[player];
    const q = byId[id]; if (!q) return;
    pl.done[id] = pl.done[id] || [];
    if (!q.daily && pl.done[id].length) return;
    if (q.daily && pl.done[id].includes(date)) return;
    pl.done[id].push(date);
    save(st);
    celebrate(q.e, `+${q.pts} points`, q.t, player);
    afterChange();
  }
  function undo(player, id, date) {
    const st = state(), pl = st.players[player];
    if (!pl.done[id]) return;
    const i = pl.done[id].indexOf(date);
    if (i >= 0) pl.done[id].splice(i, 1); else pl.done[id].pop();
    if (!pl.done[id].length) delete pl.done[id];
    save(st); afterChange();
  }
  function addFood(player, what, date) {
    const st = state(), pl = st.players[player];
    pl.foods = pl.foods || [];
    pl.foods.push({ date, what: String(what || '').slice(0, 60) });
    save(st);
    celebrate('🍽️', `+${FOOD_PTS} points`, what ? `Tried: ${what}` : 'Tried something new', player);
    afterChange();
  }
  function removeFood(player, i) { const st = state(), pl = st.players[player]; (pl.foods || []).splice(i, 1); save(st); afterChange(); }
  function afterChange() { refreshTop(); if (S.screen === 'quests') renderQuests(); if (S.screen === 'passport') renderPassport(); if (S.screen === 'home') renderHome(); }

  /* ---------------------------------------------------------------- trip helpers */
  function dayCity(d) {
    const w = String(d.where || '');
    if (/in the air|calgary/i.test(w) && !/→\s*(Tokyo|Toronto|Vancouver)/.test(w)) return 'Air';
    if (/nagoya/i.test(w)) return 'Nagoya';                       // the LEGOLAND day trip gets its own stamp
    const tail = w.includes('→') ? w.split('→').pop() : w;
    for (const c of CITIES) if (tail.toLowerCase().includes(c.toLowerCase())) return c;
    if (/nagoya/i.test(w)) return 'Nagoya';
    if (/home|townsville|cairns/i.test(tail)) return 'Home';
    for (const c of CITIES) if (w.toLowerCase().includes(c.toLowerCase())) return c;
    return 'Home';
  }
  function dateInt(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  function daysBetween(a, b) { return Math.round((dateInt(b) - dateInt(a)) / 86400000); }
  function firstDates() {
    /* first date we are in each city, from the days list (so Nagoya, a day trip, counts too) */
    const out = {};
    for (const d of S.family.days) { const c = dayCity(d); if (!(c in out) && c !== 'Home' && c !== 'Air') out[c] = d.date; }
    return out;
  }

  /* ---------------------------------------------------------------- badges (stamps are automatic by date) */
  function badges(pl, ctx) {
    ctx = ctx || currentContext();
    const F = S.family, today = ctx.date, out = [];
    const first = firstDates();
    for (const c of Object.keys(first)) {
      out.push({ id: 'stamp-' + CITY_KEY[c], e: CITY_EMOJI[c], t: c, kind: 'stamp', pts: 25, earned: today >= first[c], opens: first[c], hint: `Opens ${fmtDate(first[c])}` });
    }
    const start = F.trip.start, end = F.trip.end, total = daysBetween(start, end) + 1;
    const dayN = daysBetween(start, today) + 1;
    const nyd = F.days.find((d) => d.date >= '2027-01-01');
    const bday = F.days.find((d) => /birthday/i.test(d.plan || ''));
    const dateLine = F.days.find((d) => dayCity(d) === 'Air');
    out.push({ id: 'first-flight', e: '🛫', t: 'Wheels up', kind: 'milestone', pts: 50, earned: today >= start, hint: `Opens ${fmtDate(start)}` });
    out.push({ id: 'halfway', e: '🏁', t: 'Halfway there', kind: 'milestone', pts: 50, earned: dayN >= Math.ceil(total / 2), hint: `Day ${Math.ceil(total / 2)} of ${total}` });
    if (dateLine) out.push({ id: 'date-line', e: '🌐', t: 'Date-line crosser', kind: 'milestone', pts: 50, earned: today > dateLine.date, hint: 'Lose a day in the air' });
    if (nyd) out.push({ id: 'new-year', e: '🎆', t: 'New Year in Tokyo', kind: 'milestone', pts: 50, earned: today >= nyd.date, hint: `Opens ${fmtDate(nyd.date)}` });
    if (bday) out.push({ id: 'birthday', e: '🎂', t: 'Birthday on tour', kind: 'milestone', pts: 50, earned: today >= bday.date, hint: `Opens ${fmtDate(bday.date)}` });
    out.push({ id: 'home-again', e: '🏡', t: 'Home again', kind: 'milestone', pts: 50, earned: today >= end, hint: `Opens ${fmtDate(end)}` });
    const foods = (pl.foods || []).length;
    for (const [n, t, e] of [[5, 'Taste tester', '🍴'], [10, 'Food explorer', '🍜'], [20, 'Snack legend', '🍣']])
      out.push({ id: 'food-' + n, e, t, kind: 'skill', pts: 30, earned: foods >= n, hint: `${Math.min(foods, n)} of ${n} new foods` });
    const kindCount = (k) => Object.keys(pl.done).filter((id) => byId[id] && byId[id].kind === k).length;
    for (const [k, n, t, e] of [['words', 5, 'Chatterbox', '🗣️'], ['explore', 10, 'Explorer', '🧭'], ['helper', 5, 'Helper', '🦸'], ['travel', 4, 'Frequent flyer', '✈️']])
      out.push({ id: 'skill-' + k, e, t, kind: 'skill', pts: 30, earned: kindCount(k) >= n, hint: `${Math.min(kindCount(k), n)} of ${n} ${k} quests` });
    const photos = (pl.done.photo || []).length;
    out.push({ id: 'photo-7', e: '📸', t: 'Photo streak', kind: 'skill', pts: 30, earned: photos >= 7, hint: `${Math.min(photos, 7)} of 7 morning photos` });
    return out;
  }
  function checkNewBadges(ctx) {
    /* celebrate badges the active player has earned since we last looked (once per device) */
    const st = state(), pl = st.players[st.active];
    const fresh = badges(pl, ctx).filter((b) => b.earned && !(pl.seen || {})[b.id]);
    if (!fresh.length) return;
    pl.seen = pl.seen || {};
    for (const b of fresh) pl.seen[b.id] = ctx.date;
    save(st);
    const b = fresh[0];
    celebrate(b.e, fresh.length > 1 ? `${fresh.length} new badges` : 'New badge', b.t + (fresh.length > 1 ? ' and more' : ''), st.active);
  }

  /* ---------------------------------------------------------------- views */
  function summary(ctx) {
    const st = state(), pl = st.players[st.active], pts = points(pl), lv = level(pts);
    const todays = available(ctx, pl).filter((q) => !q.done);
    return { player: st.active, name: label(st.active), avatar: pl.avatar, points: pts, level: lv, todayLeft: todays.length,
      stamps: badges(pl, ctx).filter((b) => b.kind === 'stamp' && b.earned).length, stampsTotal: Object.keys(firstDates()).length };
  }
  function available(ctx, pl) {
    const here = ctx.before ? 'home' : ctx.city;
    return QUESTS.filter((q) => q.where === 'any' || q.where === here || (ctx.before && q.where === 'home')).map((q) => ({
      ...q, done: q.daily ? doneToday(pl, q.id, ctx.date) : doneCount(pl, q.id) > 0 }));
  }
  function playerChips(st, ctx) {
    return `<div class="players">` + people().map((p) => { const pl = st.players[p], pts = points(pl); return `<button class="player${p === st.active ? ' active' : ''}" data-player="${esc(p)}"><span class="av">${pl.avatar}</span><span class="nm">${esc(label(p))}</span><span class="pt">${pts} pts</span></button>`; }).join('') + `</div>`;
  }
  function questCard(q, ctx, player) {
    const cls = 'quest' + (q.done ? ' done' : '');
    const btn = q.done
      ? `<button class="qbtn undo" data-undo="${q.id}">Undo</button>`
      : `<button class="qbtn go" data-do="${q.id}">Done!</button>`;
    return `<div class="${cls}"><span class="qe">${q.e}</span><div class="qt"><div class="qn">${esc(q.t)}</div><div class="qp">${q.daily ? 'every day · ' : ''}${q.pts} pts${q.done ? ' · ✓ done' : ''}</div></div>${btn}</div>`;
  }
  function renderQuests() {
    const ctx = currentContext(), st = state(), player = st.active, pl = st.players[player];
    const pts = points(pl), lv = level(pts);
    const here = ctx.before ? 'Before we go' : `Here in ${ctx.city}`;
    const avail = available(ctx, pl);
    const todays = avail.filter((q) => q.where !== 'any').concat(avail.filter((q) => q.where === 'any' && q.kind === 'travel'));
    const dailies = avail.filter((q) => q.daily);
    const helpers = avail.filter((q) => q.where === 'any' && !q.daily && q.kind !== 'travel');
    let html = `<h1 class="h1">🏆 Quests</h1>` + playerChips(st, ctx);
    html += `<div class="levelcard"><div class="lv-top"><span class="lv-av">${pl.avatar}</span><div><div class="lv-name">${esc(label(player))} · ${lv.emoji} ${esc(lv.name)}</div><div class="lv-pts">${pts} points${lv.next ? ` · ${lv.next - pts} to ${esc(lv.nextName)}` : ' · top level!'}</div></div></div><div class="bar"><i style="width:${lv.pct}%"></i></div></div>`;
    html += `<div class="row"><button class="btn block" data-go-passport>📘 Passport and badges</button></div>`;
    html += `<div class="foodcard"><span class="qe">🍽️</span><div class="qt"><div class="qn">Tried a new food?</div><div class="qp">${FOOD_PTS} pts each · ${(pl.foods || []).length} so far</div></div><button class="qbtn go" id="food-add">+1</button></div>`;
    if (todays.length) html += `<h2 class="h2">${esc(here)}</h2>` + todays.map((q) => questCard(q, ctx, player)).join('');
    html += `<h2 class="h2">Every day</h2>` + dailies.map((q) => questCard(q, ctx, player)).join('');
    if (helpers.length) html += `<h2 class="h2">Any time</h2>` + helpers.map((q) => questCard(q, ctx, player)).join('');
    const others = CITIES.filter((c) => c !== ctx.city);
    html += `<h2 class="h2">Coming up</h2>` + others.map((c) => { const qs = QUESTS.filter((q) => q.where === c); return qs.length ? `<details><summary>${CITY_EMOJI[c]} ${esc(c)} <span class="chip">${qs.filter((q) => doneCount(pl, q.id)).length} / ${qs.length}</span></summary>${qs.map((q) => questCard({ ...q, done: doneCount(pl, q.id) > 0 }, ctx, player)).join('')}</details>` : ''; }).join('');
    if ((pl.foods || []).length) html += `<details><summary>🍽️ New foods tried <span class="chip">${pl.foods.length}</span></summary><ul class="list">${pl.foods.map((f, i) => `<li>${esc(f.what || 'Something new')} <span class="muted small">· ${esc(fmtDate(f.date))}</span> <button class="qbtn undo small-undo" data-food-undo="${i}">Undo</button></li>`).join('')}</ul></details>`;
    html += `<p class="tiny muted">Scores live on this device only. Mum and Dad can tick quests for the kids.</p>`;
    const el = $('#screen-quests'); el.innerHTML = html;
    wire(el, ctx, player);
  }
  function wire(el, ctx, player) {
    el.querySelectorAll('[data-player]').forEach((b) => b.onclick = () => { setActive(b.dataset.player); afterChange(); });
    el.querySelectorAll('[data-do]').forEach((b) => b.onclick = () => complete(player, b.dataset.do, ctx.date));
    el.querySelectorAll('[data-undo]').forEach((b) => b.onclick = () => undo(player, b.dataset.undo, ctx.date));
    el.querySelectorAll('[data-food-undo]').forEach((b) => b.onclick = () => removeFood(player, +b.dataset.foodUndo));
    const fa = el.querySelector('#food-add'); if (fa) fa.onclick = () => { const what = prompt('What did you try?') ; if (what !== null) addFood(player, what.trim(), ctx.date); };
    const gp = el.querySelector('[data-go-passport]'); if (gp) gp.onclick = () => show('passport');
  }
  function renderPassport() {
    const ctx = currentContext(), st = state(), player = st.active, pl = st.players[player];
    const all = badges(pl, ctx), pts = points(pl), lv = level(pts);
    const stamps = all.filter((b) => b.kind === 'stamp'), rest = all.filter((b) => b.kind !== 'stamp');
    let html = `<h1 class="h1">📘 Passport</h1>` + playerChips(st, ctx);
    html += `<div class="levelcard"><div class="lv-top"><span class="lv-av">${pl.avatar}</span><div><div class="lv-name">${esc(label(player))} · ${lv.emoji} ${esc(lv.name)}</div><div class="lv-pts">${pts} points · ${stamps.filter((b) => b.earned).length} of ${stamps.length} stamps · ${rest.filter((b) => b.earned).length} of ${rest.length} badges</div></div></div><div class="bar"><i style="width:${lv.pct}%"></i></div></div>`;
    html += `<h2 class="h2">Stamps</h2><div class="stamps">` + stamps.map((b) => `<div class="stampc${b.earned ? ' earned' : ''} ${CITY_KEY[b.t] || ''}"><span class="se">${b.e}</span><span class="st">${esc(b.t)}</span><span class="sh">${b.earned ? '✓ ' + esc(fmtDate(b.opens)) : esc(b.hint)}</span></div>`).join('') + `</div>`;
    html += `<h2 class="h2">Badges</h2><div class="stamps">` + rest.map((b) => `<div class="stampc badge${b.earned ? ' earned' : ''}"><span class="se">${b.e}</span><span class="st">${esc(b.t)}</span><span class="sh">${b.earned ? '✓ earned · ' + b.pts + ' pts' : esc(b.hint)}</span></div>`).join('') + `</div>`;
    html += `<h2 class="h2">Levels</h2><div class="card">${LEVELS.map((l) => `<div class="lvrow${pts >= l[0] ? ' got' : ''}"><span>${l[2]} ${esc(l[1])}</span><span class="muted">${l[0]} pts</span></div>`).join('')}</div>`;
    const el = $('#screen-passport'); el.innerHTML = html;
    wire(el, ctx, player);
  }
  function settingsCard() {
    const st = state();
    return `<div class="card"><div class="h3">Quest players</div>` + people().map((p) => `<div class="avrow"><span class="av big-av">${st.players[p].avatar}</span><b>${esc(label(p))}</b><span class="muted small">${points(st.players[p])} pts</span><select data-avatar="${esc(p)}">${AVATARS.map((a) => `<option${a === st.players[p].avatar ? ' selected' : ''}>${a}</option>`).join('')}</select></div>`).join('') +
      `<button class="btn block" id="opt-quests-reset">Reset all quest progress on this device</button></div>`;
  }
  function wireSettings(root) {
    root.querySelectorAll('[data-avatar]').forEach((s) => s.onchange = () => { setAvatar(s.dataset.avatar, s.value); refreshTop(); });
    const r = root.querySelector('#opt-quests-reset'); if (r) r.onclick = () => { if (confirm('Reset every player\'s points, quests and badges on this device?')) { reset(); renderSettings(); refreshTop(); } };
  }
  function refreshTop() {
    const el = $('#top-points'); if (!el || !S.family) return;
    const st = state(), pl = st.players[st.active];
    el.textContent = `${pl.avatar} ${points(pl)}`;
  }

  /* ---------------------------------------------------------------- party */
  function celebrate(emoji, big, small, player) {
    const p = $('#party'); if (!p) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bits = reduce ? '' : Array.from({ length: 36 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.12}s;background:${['#FF4D8D', '#FFB703', '#4CC9F0', '#7B2CBF', '#2A9D8F', '#E63946'][i % 6]}"></i>`).join('');
    p.innerHTML = `<div class="confetti">${bits}</div><div class="party-card"><div class="party-e">${emoji}</div><div class="party-big">${esc(big)}</div><div class="party-small">${esc(small)}</div><div class="party-who">${esc(label(player))}</div></div>`;
    p.classList.remove('hidden');
    clearTimeout(p._t);
    p._t = setTimeout(() => p.classList.add('hidden'), 2600);
    p.onclick = () => p.classList.add('hidden');
  }

  return { QUESTS, CITY_EMOJI, CITY_KEY, CITIES, dayCity, daysBetween, state, label, setActive, complete, undo, addFood, summary, badges,
    checkNewBadges, renderQuests, renderPassport, settingsCard, wireSettings, refreshTop, celebrate, reset };
})();
