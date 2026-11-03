/* World Adventure "Where are we" globe (2 Nov 2026; richer the same night: "more impressive and detailed"). A MapLibre
   globe drawn from a small whole-world archive (world.tiles, the Protomaps planet at zoom 0-3, precached with the app
   and read into memory, so no tile pack and no network): coastlines, lakes, land cover, borders and country names, a
   night side computed from the clock, stars around the sphere. The route is great-circle legs from the moves; cities
   are emoji badges (HTML markers), today's city breathes; the journey replays with the leg's vehicle (plane, bus or
   train) flying every finished leg while the globe turns, landing with a pop, then the globe settles on where the
   family is and idles round slowly until touched. Tap a badge for the city's dates, its stories and a picture, and
   jump to those stories. Shown to the family from Home ("🌏 Where are we") and the Book, and as the Where tab on
   Grandma and Grandpa's phone. Same MapLibre module as map.js; the map, markers and timers are created on enter and
   torn down on leave.
   3 Nov 2026 (Andy: "semi real time… if we are in the air it stops with the plane somewhere along the journey… the
   Whistler leg should be a bus… Montreal a train and Nagoya a train… could we do hourly?"): the family's place comes
   from the clock and the moves' depart/arrive times in each end's time zone. On a leg, the vehicle sits that far along
   the arc with the line coloured up to it; between legs the family is at the last arrival city; the caption says
   "In the air ✈️ · Calgary → Tokyo · 62% of the way · lands 16:30 Tokyo time". The screen re-places itself every
   15 minutes while open, and every open starts fresh. */
import * as maplibregl from './vendor/maplibre-gl.mjs';

const CITY_LL = { Townsville: [146.82, -19.26], Brisbane: [153.03, -27.47], Cairns: [145.77, -16.92], Vancouver: [-123.12, 49.28], Whistler: [-122.95, 50.12],
  Toronto: [-79.38, 43.65], 'New York': [-74.01, 40.71], 'Montréal': [-73.57, 45.5], Montreal: [-73.57, 45.5], Calgary: [-114.07, 51.05], Tokyo: [139.69, 35.68], Nagoya: [136.91, 35.18] };
const AIRPORT = { TSV: 'Townsville', BNE: 'Brisbane', CNS: 'Cairns', YVR: 'Vancouver', YYZ: 'Toronto', LGA: 'New York', JFK: 'New York', EWR: 'New York', YYC: 'Calgary', NRT: 'Tokyo', HND: 'Tokyo', YUL: 'Montréal' };
const EMOJI_EXTRA = { Calgary: '🛬' };
const HOME = 'Townsville';
const R = Math.PI / 180, D = 180 / Math.PI;
const G = { map: null, archive: null, markers: {}, plane: null, popup: null, raf: 0, timers: [], playing: false, idle: false, touched: false, route: null, ctx: null, family: null, doneSegs: [], clock: null };
const REFRESH_MS = 15 * 60 * 1000;                                     // the vehicle, lines and caption re-place themselves this often while the globe is open
const glyphOf = (mode) => (/train|rail|shinkansen/i.test(mode || '') ? '🚆' : /coach|bus/i.test(mode || '') ? '🚌' : '✈️');
const wordOf = (mode) => (/train|rail|shinkansen/i.test(mode || '') ? 'On the train' : /coach|bus/i.test(mode || '') ? 'On the bus' : 'In the air');
const landWord = (mode) => (glyphOf(mode) === '✈️' ? 'lands' : 'arrives');
const isPlane = (mode) => glyphOf(mode) === '✈️';

/* ---------------------------------------------------------------- the clock: local wall times in each end's zone → instants */
function tzShift(tz, ms) {                                             // minutes the zone is ahead of UTC at that instant
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms));
  const g = (t) => +p.find((x) => x.type === t).value;
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - ms) / 60000;
}
function instant(date, hhmm, tz, dayOffset) {                          // "2026-12-30" + "14:45" (or "~14:45", "16:30 +1") in tz → ms; null when unparseable
  const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); if (!m || !date) return null;
  const off = dayOffset != null ? dayOffset : +((String(hhmm).match(/\+(\d)/) || [0, 0])[1]);
  const [y, mo, d] = date.split('-').map(Number), wall = Date.UTC(y, mo - 1, d + off, +m[1], +m[2]);
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - tzShift(tz, guess) * 60000;   // two passes settle a DST edge
  return guess;
}
function timeIn(ms, tz) { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (e) { return ''; } }
function nowMs(ctx) {                                                  // the real clock, a test clock, or noon of the previewed day
  if (G.clock) return G.clock;
  if (typeof S !== 'undefined' && S.preview) return instant(S.preview, '12:00', ctx.tz) || Date.now();
  return Date.now();
}

/* ---------------------------------------------------------------- the world archive, read once and served from memory */
function archive() {
  if (!G.archive) {
    G.archive = fetch('./world.tiles').then((r) => { if (!r.ok) throw new Error('world tiles ' + r.status); return r.arrayBuffer(); })
      .then((buf) => new pmtiles.PMTiles({ getKey: () => 'world.tiles', getBytes: async (offset, length) => ({ data: buf.slice(offset, offset + length) }) }))
      .catch((e) => { G.archive = null; throw e; });
  }
  return G.archive;
}
maplibregl.addProtocol('world', async (params) => {
  const m = params.url.match(/^world:\/\/(\d+)\/(\d+)\/(\d+)/);
  if (!m) return { data: new ArrayBuffer(0) };
  const t = await (await archive()).getZxy(+m[1], +m[2], +m[3]);
  return { data: t && t.data ? t.data : new ArrayBuffer(0) };
});

/* ---------------------------------------------------------------- geometry */
function placeOf(text) {                                               // a move's frm/to → [city, lonlat]
  const s = String(text || ''), m = s.match(/\(([A-Z]{3})\)/);
  let city = m && AIRPORT[m[1]];
  if (!city) city = Object.keys(CITY_LL).find((c) => s.toLowerCase().includes(c.toLowerCase()));
  return city ? [city, CITY_LL[city]] : null;
}
function angle(a, b) { return 2 * Math.asin(Math.sqrt(Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2)); }
function legs(family) {
  const out = [];
  for (const mv of (family.moves || [])) {
    const a = placeOf(mv.frm), b = placeOf(mv.to);
    if (!(a && b && a[0] !== b[0])) continue;
    const dep = instant(mv.date, mv.depart, tzOf(a[0]));
    let arr = instant(mv.date, mv.arrive, tzOf(b[0]));
    if (dep != null && arr != null && arr <= dep) arr += 86400000;        // an arrival past midnight written without "+1"
    out.push({ from: a, to: b, date: mv.date, mode: mv.mode || '', depart: mv.depart || '', arrive: mv.arrive || '', dep, arr, km: Math.round(6371 * angle(a[1], b[1])) });
  }
  return out;
}
function partialFeatures(lg, f) {                                      // the coloured line from the leg's start to the vehicle
  const pts = arc(lg.from[1], lg.to[1], 64), k = Math.max(1, Math.round(f * (pts.length - 1)));
  return split(pts.slice(0, k + 1)).map((seg) => ({ type: 'Feature', properties: { col: colOf(lg.to[0]), done: true }, geometry: { type: 'LineString', coordinates: seg } }));
}
function arc(a, b, n) {                                                // great-circle points between two [lon, lat]
  const l1 = a[0] * R, p1 = a[1] * R, l2 = b[0] * R, p2 = b[1] * R, d = angle(a, b), pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = d ? Math.sin((1 - f) * d) / Math.sin(d) : 1 - f, B = d ? Math.sin(f * d) / Math.sin(d) : f;
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2);
    pts.push([Math.atan2(y, x) * D, Math.atan2(z, Math.sqrt(x * x + y * y)) * D]);
  }
  return pts;
}
function split(pts) {                                                  // cut a line where it crosses the antimeridian, so no leg goes the long way round
  const segs = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (Math.abs(x1 - x0) > 180) {
      const east = x0 > 0, xa = east ? 180 : -180, xb = east ? -180 : 180, span = east ? (180 - x0) + (x1 + 180) : (x0 + 180) + (180 - x1), f = (east ? 180 - x0 : x0 + 180) / span, ym = y0 + (y1 - y0) * f;
      segs[segs.length - 1].push([xa, ym]); segs.push([[xb, ym]]);
    }
    segs[segs.length - 1].push(pts[i]);
  }
  return segs.filter((s) => s.length > 1);
}
function bearing(a, b) { const l1 = a[0] * R, p1 = a[1] * R, l2 = b[0] * R, p2 = b[1] * R, y = Math.sin(l2 - l1) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1); return (Math.atan2(y, x) * D + 360) % 360; }
function colOf(city) { try { return getComputedStyle(document.documentElement).getPropertyValue('--c-' + (Quests.CITY_KEY[city] || 'home')).trim() || '#2A9D8F'; } catch (e) { return '#2A9D8F'; } }
function emojiOf(city) { return Quests.CITY_EMOJI[city] || EMOJI_EXTRA[city] || '📍'; }
const lines = (features) => ({ type: 'FeatureCollection', features });
function legFeatures(lgs, props) { const out = []; for (const lg of lgs) for (const seg of split(arc(lg.from[1], lg.to[1], 48))) out.push({ type: 'Feature', properties: Object.assign({ col: colOf(lg.to[0]) }, props), geometry: { type: 'LineString', coordinates: seg } }); return out; }

/* the sun: subsolar point from the clock, and the night hemisphere as a polygon (the terminator closed over the dark pole) */
function sunPos(date) {
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const L = (280.460 + 0.9856474 * d) % 360, g = ((357.528 + 0.9856003 * d) % 360) * R;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R, eps = 23.439 * R;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)), ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  return [((ra * D - gmst * 15) % 360 + 540) % 360 - 180, dec * D];
}
function night(date, inset) {                                          // inset: degrees of latitude pushed into the night, for the soft edge
  const [slon, slat] = sunPos(date || new Date()), dark = slat > 0 ? -1 : 1, ring = [];
  for (let lon = -180; lon <= 180; lon += 2) ring.push([lon, Math.max(-89, Math.min(89, Math.atan(-Math.cos((lon - slon) * R) / Math.tan(slat * R || 1e-6)) * D + dark * (inset || 0)))]);
  ring.push([180, dark * 89], [-180, dark * 89], ring[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
function isNight(lonlat, date) { const [slon, slat] = sunPos(date || new Date()); return Math.sin(lonlat[1] * R) * Math.sin(slat * R) + Math.cos(lonlat[1] * R) * Math.cos(slat * R) * Math.cos((lonlat[0] - slon) * R) < 0; }

/* ---------------------------------------------------------------- the route for a day */
function routeData(ctx, family) {
  const today = ctx.date, L = legs(family), arr = Quests.arrivals(), seen = new Map(), now = nowMs(ctx);
  for (const lg of L) {
    if (lg.dep != null && lg.arr != null) { lg.f = (now - lg.dep) / (lg.arr - lg.dep); lg.done = lg.f >= 1; lg.on = lg.f >= 0 && lg.f < 1; }
    else { lg.f = null; lg.on = false; lg.done = lg.date < today || (lg.date === today && !ctx.inAir && lg.depart.replace('~', '') <= localTime(ctx.tz)); }   // a move without times: by the date
  }
  const flown = L.filter((lg) => lg.done), riding = L.find((lg) => lg.on) || null, lastDone = flown[flown.length - 1] || null;
  const add = (city, when) => { if (CITY_LL[city] && !seen.has(city)) seen.set(city, when); };
  add(HOME, 'Home');
  for (const lg of L) { add(lg.from[0], ''); add(lg.to[0], fmtDate(lg.date)); }
  for (const [c, a] of Object.entries(arr)) add(c, fmtDate(a.date));
  // where the family is right now: on a leg, else at the last arrival city (before the first leg, and after the last, home)
  const here = riding ? null : ctx.before ? HOME : lastDone ? lastDone.to[0] : HOME;
  const visited = (city) => city === HOME || (arr[city] && arr[city].date <= today) || L.some((lg) => lg.to[0] === city && lg.done);
  const cities = [...seen].map(([city, when]) => ({ city, when: when || (arr[city] ? fmtDate(arr[city].date) : ''), col: colOf(city), visited: !ctx.before && visited(city) || city === HOME, now: city === here }));
  let target = here ? CITY_LL[here] : null, planeAt = null, planeLeg = null;
  if (riding) { planeLeg = riding; planeAt = arc(riding.from[1], riding.to[1], 64)[Math.round(riding.f * 64)]; target = planeAt; }
  const next = L.find((lg) => (lg.f != null ? lg.f < 0 : !lg.done)) || null;
  return { L, flown, todo: L.filter((lg) => !lg.done), cities, here, target: target || CITY_LL[HOME], planeAt, planeLeg, riding, next, now,
    glyph: glyphOf(riding ? riding.mode : ''), flownKm: Math.round(flown.reduce((s, lg) => s + lg.km, 0) + (riding ? riding.km * riding.f : 0)), totalKm: L.reduce((s, lg) => s + lg.km, 0) };
}
function whereNow(ctx, family) {                                       // for Home: { here, riding: { from, to, mode, f, glyph, word } | null }
  const r = routeData(ctx, family);
  return { here: r.here, riding: r.riding ? { from: r.riding.from[0], to: r.riding.to[0], mode: r.riding.mode, f: r.riding.f, glyph: glyphOf(r.riding.mode), word: wordOf(r.riding.mode) } : null };
}

/* ---------------------------------------------------------------- the style */
function styleOf(r) {
  const base = new URL('.', location.href).href;
  return {
    version: 8, glyphs: base + 'style/fonts/{fontstack}/{range}.pbf', projection: { type: 'globe' },
    sky: { 'sky-color': '#0B1B33', 'horizon-color': '#8FC6EE', 'fog-color': '#BFE3F5', 'sky-horizon-blend': 0.9, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.6, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    sources: {
      world: { type: 'vector', tiles: ['world://{z}/{x}/{y}'], minzoom: 0, maxzoom: 3 },
      todo: { type: 'geojson', data: lines(legFeatures(r.todo, { done: false })) },
      done: { type: 'geojson', data: lines(legFeatures(r.flown, { done: true }).concat(r.riding ? partialFeatures(r.riding, r.riding.f) : [])) },
      night: { type: 'geojson', data: lines([night(new Date(), 0)]) },
      night2: { type: 'geojson', data: lines([night(new Date(), 7)]) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#8FCBE6' } },
      { id: 'earth', type: 'fill', source: 'world', 'source-layer': 'earth', paint: { 'fill-color': '#EFE8D2' } },
      { id: 'landcover', type: 'fill', source: 'world', 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'kind'], 'glacier', '#FFFFFF', 'forest', '#BBD5A3', 'grassland', '#D9E4B0', 'scrub', '#D3DDA8', 'farmland', '#E3E2B6', 'barren', '#E6DCBF', 'urban_area', '#DDD6CC', 'wetland', '#C6DED2', '#E9E2CB'], 'fill-opacity': 0.9 } },
      { id: 'water', type: 'fill', source: 'world', 'source-layer': 'water', paint: { 'fill-color': '#8FCBE6' } },
      { id: 'bounds', type: 'line', source: 'world', 'source-layer': 'boundaries', paint: { 'line-color': '#B9AE95', 'line-width': 0.7, 'line-opacity': 0.8 } },
      { id: 'night', type: 'fill', source: 'night', paint: { 'fill-color': '#081230', 'fill-opacity': 0.22, 'fill-antialias': false } },
      { id: 'night2', type: 'fill', source: 'night2', paint: { 'fill-color': '#081230', 'fill-opacity': 0.2, 'fill-antialias': false } },
      { id: 'countries', type: 'symbol', source: 'world', 'source-layer': 'places', maxzoom: 3.5, filter: ['==', ['get', 'kind'], 'country'], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 6 }, paint: { 'text-color': '#6B7280', 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1.1 } },
      { id: 'leg-todo', type: 'line', source: 'todo', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#5F6B7A', 'line-width': 2.2, 'line-opacity': 0.8, 'line-dasharray': [1.2, 2] } },
      { id: 'leg-done-glow', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': 9, 'line-opacity': 0.22, 'line-blur': 3 } },
      { id: 'leg-done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': 3.5 } },
    ],
  };
}

/* ---------------------------------------------------------------- the calendar and clock over the globe (3 Nov 2026: "a calendar and clock tick over while it runs through up to the current time") */
const CLK = { el: null, day: null };
function dateIn(ms, tz) { try { const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)); const g = (t) => p.find((x) => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; } catch (e) { return ''; } }
function clockEl() {
  if (CLK.el && document.body.contains(CLK.el)) return CLK.el;
  const wrap = document.getElementById('globe-wrap'); if (!wrap) return null;
  const el = document.createElement('div'); el.className = 'gclock'; el.setAttribute('aria-live', 'off');
  el.innerHTML = `<span class="gcal"><i></i><b></b><u></u></span><span class="gtime"><b></b><i></i></span>`;
  wrap.appendChild(el); CLK.el = el; CLK.day = null;
  return el;
}
function showClock(ms, tz, label) {                                    // a page-a-day calendar (flips when the day changes) and the time, in tz
  const el = clockEl(); if (!el || ms == null) return;
  let p; try { p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)); } catch (e) { return; }
  const g = (t) => (p.find((x) => x.type === t) || {}).value || '', day = `${g('day')}|${g('month')}`;
  el.querySelector('.gcal i').textContent = g('month').toUpperCase(); el.querySelector('.gcal b').textContent = g('day'); el.querySelector('.gcal u').textContent = g('weekday');
  el.querySelector('.gtime b').textContent = `${g('hour')}:${g('minute')}`; el.querySelector('.gtime i').textContent = label || '';
  if (CLK.day !== null && CLK.day !== day) { const c = el.querySelector('.gcal'); c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip'); }
  CLK.day = day;
}
function showNow(r) {                                                  // the real clock where the family is (the destination while on a leg)
  const city = r.riding ? r.riding.to[0] : (r.here || HOME);
  showClock(r.now != null ? r.now : Date.now(), tzOf(city), `${city} time`);
}
function showLegClock(lg, frac) {                                      // the replay: the time along a leg, in the destination's zone
  if (lg.dep == null || lg.arr == null) { showClock(Date.parse(lg.date + 'T12:00:00Z'), tzOf(lg.to[0]), `${lg.to[0]} time`); return; }
  showClock(lg.dep + Math.max(0, Math.min(1, frac)) * (lg.arr - lg.dep), tzOf(lg.to[0]), `${lg.to[0]} time`);
}
function tickDays(map, fromMs, toMs, tz, city, done) {                // between legs the calendar flips a day at a time (and up to today after the last)
  if (fromMs == null || toMs == null || toMs <= fromMs) { done(); return; }
  const n = Math.max(0, Quests.daysBetween(dateIn(fromMs, tz), dateIn(toMs, tz))), step = n > 12 ? 70 : 150;
  let k = 0;
  const tick = () => {
    if (!G.playing || G.map !== map) return;
    k++;
    if (k > n) { showClock(toMs, tz, `${city} time`); done(); return; }
    showClock(fromMs + k * 86400000, tz, `${city} time`);
    G.timers.push(setTimeout(tick, step));
  };
  G.timers.push(setTimeout(tick, n ? 220 : 0));
}

/* ---------------------------------------------------------------- caption, badges, popup */
function captionHtml(ctx, family, r) {
  const grand = Quests.isGrandDevice(), total = Quests.daysBetween(family.trip.start, family.trip.end) + 1, dayN = Quests.daysBetween(family.trip.start, ctx.date) + 1, nl = r.next;
  const km = (n) => n.toLocaleString('en-AU'), when = (ms) => (ms ? new Date(ms) : new Date());
  let big, sub;
  if (ctx.before) { big = `${Math.max(0, Quests.daysBetween(ctx.date, family.trip.start))} sleeps to go`; sub = `${r.L.length} legs and ${km(r.totalKm)} km, from ${HOME} and back`; }
  else if (dayN > total && !r.riding) { big = 'Home again 🏡'; sub = `${r.L.length} legs and ${km(r.totalKm)} km travelled · ${total} days of adventure`; }
  else if (r.riding) {                                                 // on a leg: the vehicle, the ends, how far along, when it gets in
    const lg = r.riding;
    big = `Day ${dayN} of ${total} · ${wordOf(lg.mode)} ${glyphOf(lg.mode)}`;
    sub = `${lg.from[0]} → ${lg.to[0]} · ${Math.round(lg.f * 100)}% of the way · ${landWord(lg.mode)} ${timeIn(lg.arr, tzOf(lg.to[0]))} ${lg.to[0]} time · ${timeIn(r.now, TZ.Home)} at home`;
  } else {
    const city = r.here || ctx.city, tz = tzOf(city === HOME ? 'Home' : city), dark = r.target && isNight(r.target, when(r.now)) ? ' · 🌙 night' : '';
    big = `Day ${dayN} of ${total} · ${city} ${emojiOf(city)}`;
    sub = `${timeIn(r.now, tz)} ${grand ? 'there' : 'here'}${dark} · ${timeIn(r.now, TZ.Home)} at home · ${km(r.flownKm)} of ${km(r.totalKm)} km · ${r.flown.length} of ${r.L.length} legs`;
  }
  const next = nl ? `<div class="small">Next: ${glyphOf(nl.mode)} ${esc(nl.from[0])} → ${esc(nl.to[0])} · ${esc(fmtDate(nl.date))}${nl.depart ? ' · ' + esc(nl.depart) : ''}</div>` : '';
  return `<h1 class="h1">🌏 ${grand ? 'Where are they?' : 'Where are we?'}</h1><div class="card where-card"><div class="big">${esc(big)}</div><div class="small muted">${esc(sub)}</div>${next}</div>`;
}
function addBadges(map, r) {
  const hereWord = Quests.isGrandDevice() ? 'They are here' : 'We are here';   // shown under the city the family is in (4 Nov 2026: cities sit close together, so the badge shouts)
  for (const c of r.cities) {
    const el = document.createElement('div');
    el.className = 'gb' + (c.visited ? ' seen' : '') + (c.now ? ' now' : ''); el.style.setProperty('--gc', c.col); el.dataset.city = c.city;
    el.innerHTML = `<span class="ge">${emojiOf(c.city)}</span><span class="gn">${esc(c.city)}</span><span class="gh">${hereWord}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); stopPlaying(); openPopup(c.city); });
    G.markers[c.city] = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(CITY_LL[c.city]).addTo(map);
  }
}
function landPop(city) { const m = G.markers[city]; if (!m) return; const el = m.getElement(); el.classList.remove('land'); void el.offsetWidth; el.classList.add('land'); el.classList.add('seen'); }
function openPopup(city) {
  const map = G.map; if (!map) return;
  if (G.popup) { G.popup.remove(); G.popup = null; }
  const r = G.route, arr = Quests.arrivals(), a = arr[city], leave = r.L.find((lg) => lg.from[0] === city && (!a || lg.date >= a.date));
  const st = window.Journal && Journal.cityStats ? Journal.cityStats(city) : { stories: 0, pictures: 0, firstDate: null, photoId: null };
  let when = city === HOME ? 'Home' : a ? `Arrive ${fmtDate(a.date)}` : '';
  if (leave && city !== HOME) when += `${when ? ' · ' : ''}Leave ${fmtDate(leave.date)}`;
  const html = `<div class="where-pop"><b>${emojiOf(city)} ${esc(city)}</b>${when ? `<div class="small muted">${esc(when)}</div>` : ''}<div class="small">${st.stories ? `${st.stories} stor${st.stories === 1 ? 'y' : 'ies'} · ${st.pictures} picture${st.pictures === 1 ? '' : 's'}` : 'No stories from here yet'}</div>${st.photoId ? `<img data-oid="${esc(st.photoId)}t" alt="">` : ''}${st.firstDate ? `<button class="btn small-btn" data-stories="${esc(st.firstDate)}">See the stories →</button>` : ''}</div>`;
  G.popup = new maplibregl.Popup({ closeButton: false, offset: 22, maxWidth: '220px' }).setLngLat(CITY_LL[city]).setHTML(html).addTo(map);
  const el = G.popup.getElement();
  const img = el.querySelector('img[data-oid]'); if (img) Media.url(img.dataset.oid, 'thumb').then((u) => { if (u) img.src = u; else img.remove(); });
  const go = el.querySelector('[data-stories]'); if (go) go.onclick = () => { const d = go.dataset.stories; show('story'); Journal.scrollToDate(d); };
}

/* ---------------------------------------------------------------- the journey */
function setDone(map, segs) { const src = map.getSource('done'); if (src) src.setData(lines(segs)); }
function planeEl(glyph) { const el = document.createElement('div'); el.className = 'gp'; el.textContent = glyph || '✈️'; return el; }
function vehicle(map) {                                                // the one vehicle marker: made on load, remade if it went missing (a stray element is swept first)
  if (G.plane || !map) return G.plane;
  try {
    map.getCanvasContainer().querySelectorAll('.gp').forEach((n) => n.remove());
    const r = G.route;
    G.plane = new maplibregl.Marker({ element: planeEl(r && r.glyph), anchor: 'center', rotationAlignment: 'map', rotation: 0 }).setLngLat((r && r.planeAt) || CITY_LL[HOME]).addTo(map);
  } catch (e) { G.plane = null; if (window.logErr) logErr('globe vehicle: ' + ((e && e.message) || e)); }
  return G.plane;
}
function rotationFor(lg, at) { return isPlane(lg.mode) ? bearing(at, lg.to[1]) - 45 : 0; }   // the ✈️ glyph points north-east; a bus or train stays upright
function placeVehicle(r) {                                             // the done lines (with the part-leg) and the vehicle where the clock says
  const map = G.map; if (!map) return;
  const done = legFeatures(r.flown, { done: true }).concat(r.riding ? partialFeatures(r.riding, r.riding.f) : []);
  setDone(map, done); G.doneSegs = done;
  const pl = vehicle(map); if (!pl) return;
  const el = pl.getElement();
  if (r.planeAt) { el.style.display = ''; el.textContent = r.glyph; el.classList.add('bob'); pl.setLngLat(r.planeAt).setRotation(rotationFor(r.planeLeg, r.planeAt)); }
  else el.style.display = 'none';
}
function refresh() {                                                   // the clock moved on (every 15 min while open): re-place everything without rebuilding the map
  const map = G.map; if (!map || G.playing || !G.family) return;
  const ctx = typeof currentContext === 'function' ? currentContext() : G.ctx; G.ctx = ctx;
  const r = routeData(ctx, G.family); G.route = r;
  const cap = document.getElementById('where-cap'); if (cap) cap.innerHTML = captionHtml(ctx, G.family, r);
  for (const c of r.cities) { const m = G.markers[c.city]; if (m) { m.getElement().classList.toggle('now', c.now); m.getElement().classList.toggle('seen', c.visited); } }
  const todo = map.getSource('todo'); if (todo) todo.setData(lines(legFeatures(r.todo, { done: false })));
  placeVehicle(r); showNow(r);
}
function stopPlaying() {
  G.playing = false; if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
  for (const t of G.timers) clearTimeout(t); G.timers.length = 0;
  const b = document.getElementById('globe-play'); if (b) b.textContent = '▶ Replay the journey';
}
function settle(map, r, reduce) {
  if (G.map !== map) return;
  placeVehicle(r); showNow(r);
  const zoom = r.here || r.planeAt ? 2.5 : 1.5;
  if (reduce) map.jumpTo({ center: r.target, zoom }); else map.easeTo({ center: r.target, zoom, duration: 1400, essential: true });
  G.timers.push(setTimeout(() => startIdle(map), reduce ? 0 : 1800));
}
function startIdle(map) {
  if (G.map !== map || G.touched || G.playing) return;
  G.idle = true;
  const step = () => { if (G.map !== map || !G.idle || G.touched || G.playing) { G.idle = false; return; } const c = map.getCenter(); map.jumpTo({ center: [c.lng + 0.03, c.lat] }); G.raf = requestAnimationFrame(step); };
  G.raf = requestAnimationFrame(step);
}
function playJourney(map, r) {
  const reduce = window.FX && FX.reduce && FX.reduce();
  stopPlaying(); G.idle = false;
  if (reduce) { settle(map, r, true); return; }
  G.playing = true;
  const b = document.getElementById('globe-play'); if (b) b.textContent = '⏸ Stop';
  const pl = vehicle(map); if (!pl) { settle(map, r, true); return; }
  pl.getElement().style.display = ''; pl.getElement().classList.remove('bob');
  const flown = r.flown.slice();
  if (r.riding) flown.push(Object.assign({}, r.riding, { upTo: r.riding.f }));   // the leg under way plays up to where the vehicle is now
  if (!flown.length) {                                                 // not yet departed: a quick tour of the whole route, then home
    setDone(map, []);
    let i = 0;
    const hop = () => { if (!G.playing || G.map !== map) return; if (i >= r.L.length) { settle(map, r, false); stopPlaying(); return; } const lg = r.L[i++]; showLegClock(lg, 1); map.easeTo({ center: lg.to[1], zoom: 1.6, duration: 420, easing: (t) => t }); G.timers.push(setTimeout(hop, 440)); };
    map.easeTo({ center: CITY_LL[HOME], zoom: 1.6, duration: 600 }); G.timers.push(setTimeout(hop, 650));
    return;
  }
  const doneSegs = []; let i = 0;
  pl.setLngLat(flown[0].from[1]);
  const flyLeg = () => {
    if (!G.playing || G.map !== map) return;
    if (i >= flown.length) { G.playing = false; settle(map, r, false); stopPlaying(); return; }
    const lg = flown[i++], pts = arc(lg.from[1], lg.to[1], 64), cap = lg.upTo == null ? 1 : lg.upTo, kEnd = Math.round(cap * (pts.length - 1));
    const dur = (420 + 95 * lg.km / 1000) * cap, t0 = performance.now(), col = colOf(lg.to[0]), plane = isPlane(lg.mode);
    pl.getElement().textContent = glyphOf(lg.mode);
    map.easeTo({ center: pts[kEnd], zoom: 2.0, duration: dur, easing: (t) => t, essential: true });
    const step = (now) => {
      if (!G.playing || G.map !== map) return;
      const f = Math.min(1, (now - t0) / dur), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2, k = Math.round(e * kEnd);
      pl.setLngLat(pts[k]).setRotation(plane ? bearing(pts[Math.max(0, k - 1)], pts[Math.min(pts.length - 1, k + 1)]) - 45 : 0);
      showLegClock(lg, k / (pts.length - 1));
      const partial = split(pts.slice(0, k + 1)).map((seg) => ({ type: 'Feature', properties: { col, done: true }, geometry: { type: 'LineString', coordinates: seg } }));
      setDone(map, doneSegs.concat(partial));
      if (f < 1) G.raf = requestAnimationFrame(step);
      else {
        for (const seg of split(pts.slice(0, kEnd + 1))) doneSegs.push({ type: 'Feature', properties: { col, done: true }, geometry: { type: 'LineString', coordinates: seg } });
        if (lg.upTo != null) { G.timers.push(setTimeout(flyLeg, 160)); return; }          // the leg under way ends at now
        landPop(lg.to[0]);
        const nx = flown[i];                                                               // the days in the city flip by on the calendar, up to the next departure (or today)
        tickDays(map, lg.arr, nx ? nx.dep : r.now, tzOf(lg.to[0]), lg.to[0], () => G.timers.push(setTimeout(flyLeg, 120)));
      }
    };
    G.raf = requestAnimationFrame(step);
  };
  showLegClock(flown[0], 0);
  map.easeTo({ center: flown[0].from[1], zoom: 2.0, duration: 500 }); G.timers.push(setTimeout(flyLeg, 520));
}

/* ---------------------------------------------------------------- the screen */
function build(ctx, family) {
  const r = routeData(ctx, family); G.route = r; G.touched = false;
  const map = new maplibregl.Map({ container: 'globe', style: styleOf(r), center: CITY_LL[HOME], zoom: 1.1, maxPitch: 0, dragRotate: false, touchPitch: false, pitchWithRotate: false, attributionControl: false, fadeDuration: 0 });
  G.map = map;
  const touched = () => { G.touched = true; G.idle = false; if (G.playing) stopPlaying(); };
  for (const ev of ['mousedown', 'touchstart', 'wheel']) map.on(ev, touched);
  map.on('load', () => {
    if (G.map !== map) return;
    addBadges(map, r);
    vehicle(map);
    if (G.plane && !r.planeAt) G.plane.getElement().style.display = 'none';
    G.timers.push(setInterval(() => {
      if (G.map !== map) return;
      const a = map.getSource('night'), b = map.getSource('night2'); if (a) a.setData(lines([night(new Date(), 0)])); if (b) b.setData(lines([night(new Date(), 7)]));
      if (!G.playing && G.route) showNow(Object.assign({}, G.route, { now: nowMs(G.ctx) }));   // the clock keeps time between refreshes
    }, 60000));
    G.timers.push(setInterval(refresh, REFRESH_MS));
    showNow(r);
    playJourney(map, r);
  });
  map.on('error', (e) => { if (window.logErr && e && e.error) logErr('globe: ' + (e.error.message || e.error)); });
  return r;
}
function enter(ctx, family) {
  const el = document.getElementById('screen-where'); if (!el || !family) return;
  leave();
  G.ctx = ctx; G.family = family;
  let r = null;
  try { r = routeData(ctx, family); } catch (e) { el.innerHTML = `<h1 class="h1">🌏 Where are we?</h1><div class="card red">${esc((e && e.message) || e)}</div>`; return; }
  el.innerHTML = `<div id="where-cap">${captionHtml(ctx, family, r)}</div><div id="globe-wrap"><div id="globe"></div></div><div class="where-row"><button class="btn small-btn" id="globe-play">▶ Replay the journey</button><span class="tiny muted">Drag to spin · tap a city · map data © OpenStreetMap contributors, Protomaps</span></div>`;
  try { build(ctx, family); }
  catch (e) { const g = document.getElementById('globe'); if (g) g.outerHTML = `<div class="card">The globe needs a newer phone browser: ${esc((e && e.message) || e)}</div>`; if (window.logErr) logErr('globe: ' + ((e && e.message) || e)); }
  const b = document.getElementById('globe-play');
  if (b) b.onclick = () => { if (!G.map) return; if (G.playing) { stopPlaying(); settle(G.map, G.route, true); } else { G.touched = false; playJourney(G.map, G.route); } };
}
function leave() {
  stopPlaying(); G.idle = false; CLK.el = null; CLK.day = null;
  for (const t of G.timers) { clearTimeout(t); clearInterval(t); } G.timers.length = 0;
  if (G.popup) { G.popup.remove(); G.popup = null; }
  for (const m of Object.values(G.markers)) { try { m.remove(); } catch (e) { /* gone */ } } G.markers = {};
  if (G.plane) { try { G.plane.remove(); } catch (e) { /* gone */ } G.plane = null; }
  if (G.map) { const m = G.map; G.map = null; try { m.remove(); } catch (e) { /* already gone */ } }
}

window.Globe = { enter, leave, refresh, routeData, whereNow, legs, arc, split, night, sunPos, isNight, instant, glyphOf, wordOf,
  setClock: (ms) => { G.clock = ms || null; },                         // tests: pin the clock (ms since the epoch); null for the real one
  get map() { return G.map; }, get playing() { return G.playing; }, get idle() { return G.idle; } };
