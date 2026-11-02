/* World Adventure "Where are we" globe (2 Nov 2026; richer the same night: "more impressive and detailed"). A MapLibre
   globe drawn from a small whole-world archive (world.tiles, the Protomaps planet at zoom 0-3, precached with the app
   and read into memory, so no tile pack and no network): coastlines, lakes, land cover, borders and country names, a
   night side computed from the clock, stars around the sphere. The route is great-circle legs from the moves; cities
   are emoji badges (HTML markers), today's city breathes; the journey replays with a plane flying every flown leg
   while the globe turns, landing with a pop, then the globe settles on today's city and idles round slowly until
   touched. Tap a badge for the city's dates, its stories and a picture, and jump to those stories. Shown to the family
   from Home ("🌏 Where are we") and the Book, and as the Where tab on Grandma and Grandpa's phone. Same MapLibre module
   as map.js; the map, markers and timers are created on enter and torn down on leave. */
import * as maplibregl from './vendor/maplibre-gl.mjs';

const CITY_LL = { Townsville: [146.82, -19.26], Brisbane: [153.03, -27.47], Cairns: [145.77, -16.92], Vancouver: [-123.12, 49.28], Whistler: [-122.95, 50.12],
  Toronto: [-79.38, 43.65], 'New York': [-74.01, 40.71], 'Montréal': [-73.57, 45.5], Montreal: [-73.57, 45.5], Calgary: [-114.07, 51.05], Tokyo: [139.69, 35.68], Nagoya: [136.91, 35.18] };
const AIRPORT = { TSV: 'Townsville', BNE: 'Brisbane', CNS: 'Cairns', YVR: 'Vancouver', YYZ: 'Toronto', LGA: 'New York', JFK: 'New York', EWR: 'New York', YYC: 'Calgary', NRT: 'Tokyo', HND: 'Tokyo', YUL: 'Montréal' };
const EMOJI_EXTRA = { Calgary: '🛬' };
const HOME = 'Townsville';
const R = Math.PI / 180, D = 180 / Math.PI;
const G = { map: null, archive: null, markers: {}, plane: null, popup: null, raf: 0, timers: [], playing: false, idle: false, touched: false, route: null, ctx: null, family: null, doneSegs: [] };

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
    if (a && b && a[0] !== b[0]) out.push({ from: a, to: b, date: mv.date, mode: mv.mode || '', depart: mv.depart || '', km: Math.round(6371 * angle(a[1], b[1])) });
  }
  return out;
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
  const today = ctx.date, L = legs(family), arr = Quests.arrivals(), seen = new Map();
  for (const lg of L) lg.done = lg.date < today || (lg.date === today && !ctx.inAir && lg.depart.replace('~', '') <= localTime(ctx.tz));
  const flown = L.filter((lg) => lg.done);
  const add = (city, when) => { if (CITY_LL[city] && !seen.has(city)) seen.set(city, when); };
  add(HOME, 'Home');
  for (const lg of L) { add(lg.from[0], ''); add(lg.to[0], fmtDate(lg.date)); }
  for (const [c, a] of Object.entries(arr)) add(c, fmtDate(a.date));
  const here = ctx.before ? HOME : ctx.inAir ? null : (ctx.city === 'Home' ? HOME : (CITY_LL[ctx.city] ? ctx.city : null));
  const visited = (city) => city === HOME || (arr[city] && arr[city].date <= today) || L.some((lg) => lg.to[0] === city && lg.done);
  const cities = [...seen].map(([city, when]) => ({ city, when: when || (arr[city] ? fmtDate(arr[city].date) : ''), col: colOf(city), visited: !ctx.before && visited(city) || city === HOME, now: city === here }));
  let target = here ? CITY_LL[here] : null, planeAt = null, planeLeg = null;
  if (ctx.inAir) {
    planeLeg = L.find((x) => x.date === today) || L.find((x) => x.date > today) || L[L.length - 1];
    if (planeLeg) { planeAt = arc(planeLeg.from[1], planeLeg.to[1], 2)[1]; target = planeAt; }
  }
  return { L, flown, todo: L.filter((lg) => !lg.done), cities, here, target: target || CITY_LL[HOME], planeAt, planeLeg,
    flownKm: flown.reduce((s, lg) => s + lg.km, 0), totalKm: L.reduce((s, lg) => s + lg.km, 0) };
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
      done: { type: 'geojson', data: lines(legFeatures(r.flown, { done: true })) },
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

/* ---------------------------------------------------------------- caption, badges, popup */
function captionHtml(ctx, family, r) {
  const grand = Quests.isGrandDevice(), total = Quests.daysBetween(family.trip.start, family.trip.end) + 1, dayN = Quests.daysBetween(family.trip.start, ctx.date) + 1, nm = nextMove(ctx);
  const km = (n) => n.toLocaleString('en-AU');
  let big, sub;
  if (ctx.before) { big = `${Math.max(0, Quests.daysBetween(ctx.date, family.trip.start))} sleeps to go`; sub = `${r.L.length} legs and ${km(r.totalKm)} km, from ${HOME} and back`; }
  else if (dayN > total) { big = 'Home again 🏡'; sub = `${r.L.length} legs and ${km(r.totalKm)} km flown · ${total} days of adventure`; }
  else {
    const dark = r.target && isNight(r.target) ? ' · 🌙 night' : '';
    big = `Day ${dayN} of ${total} · ${ctx.inAir ? 'In the air ✈️' : `${ctx.city} ${emojiOf(ctx.city)}`}`;
    sub = `${localTime(ctx.tz)} ${grand ? 'there' : 'here'}${dark} · ${localTime(TZ.Home)} at home · ${km(r.flownKm)} of ${km(r.totalKm)} km · ${r.flown.length} of ${r.L.length} legs`;
  }
  const next = nm ? `<div class="small">Next: ${/train/i.test(nm.mode || '') ? '🚆' : /coach|bus/i.test(nm.mode || '') ? '🚌' : '✈️'} ${esc(nm.frm || '')} → ${esc(nm.to || '')} · ${esc(fmtDate(nm.date))}${nm.depart ? ' · ' + esc(nm.depart) : ''}</div>` : '';
  return `<h1 class="h1">🌏 ${grand ? 'Where are they?' : 'Where are we?'}</h1><div class="card where-card"><div class="big">${esc(big)}</div><div class="small muted">${esc(sub)}</div>${next}</div>`;
}
function addBadges(map, r) {
  for (const c of r.cities) {
    const el = document.createElement('div');
    el.className = 'gb' + (c.visited ? ' seen' : '') + (c.now ? ' now' : ''); el.style.setProperty('--gc', c.col); el.dataset.city = c.city;
    el.innerHTML = `<span class="ge">${emojiOf(c.city)}</span><span class="gn">${esc(c.city)}</span>`;
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
function planeEl() { const el = document.createElement('div'); el.className = 'gp'; el.textContent = '✈️'; return el; }
function stopPlaying() {
  G.playing = false; if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
  for (const t of G.timers) clearTimeout(t); G.timers.length = 0;
  const b = document.getElementById('globe-play'); if (b) b.textContent = '▶ Replay the journey';
}
function settle(map, r, reduce) {
  if (G.map !== map) return;
  const done = legFeatures(r.flown, { done: true }); setDone(map, done); G.doneSegs = done;
  if (G.plane) { if (r.planeAt) { G.plane.setLngLat(r.planeAt).setRotation(bearing(r.planeLeg.from[1], r.planeLeg.to[1]) - 45); G.plane.getElement().classList.add('bob'); } else G.plane.getElement().style.display = 'none'; }
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
  if (G.plane) { G.plane.getElement().style.display = ''; G.plane.getElement().classList.remove('bob'); }
  const flown = r.flown.slice();
  if (!flown.length) {                                                 // not yet departed: a quick tour of the whole route, then home
    setDone(map, []);
    let i = 0;
    const hop = () => { if (!G.playing || G.map !== map) return; if (i >= r.L.length) { settle(map, r, false); stopPlaying(); return; } const lg = r.L[i++]; map.easeTo({ center: lg.to[1], zoom: 1.6, duration: 420, easing: (t) => t }); G.timers.push(setTimeout(hop, 440)); };
    map.easeTo({ center: CITY_LL[HOME], zoom: 1.6, duration: 600 }); G.timers.push(setTimeout(hop, 650));
    return;
  }
  const doneSegs = []; let i = 0;
  G.plane.setLngLat(flown[0].from[1]);
  const flyLeg = () => {
    if (!G.playing || G.map !== map) return;
    if (i >= flown.length) { G.playing = false; settle(map, r, false); stopPlaying(); return; }
    const lg = flown[i++], pts = arc(lg.from[1], lg.to[1], 64), dur = 420 + 95 * lg.km / 1000, t0 = performance.now(), col = colOf(lg.to[0]);
    map.easeTo({ center: lg.to[1], zoom: 2.0, duration: dur, easing: (t) => t, essential: true });
    const step = (now) => {
      if (!G.playing || G.map !== map) return;
      const f = Math.min(1, (now - t0) / dur), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2, k = Math.round(e * (pts.length - 1));
      G.plane.setLngLat(pts[k]).setRotation(bearing(pts[Math.max(0, k - 1)], pts[Math.min(pts.length - 1, k + 1)]) - 45);
      const partial = split(pts.slice(0, k + 1)).map((seg) => ({ type: 'Feature', properties: { col, done: true }, geometry: { type: 'LineString', coordinates: seg } }));
      setDone(map, doneSegs.concat(partial));
      if (f < 1) G.raf = requestAnimationFrame(step);
      else { for (const seg of split(pts)) doneSegs.push({ type: 'Feature', properties: { col, done: true }, geometry: { type: 'LineString', coordinates: seg } }); landPop(lg.to[0]); G.timers.push(setTimeout(flyLeg, 160)); }
    };
    G.raf = requestAnimationFrame(step);
  };
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
    G.plane = new maplibregl.Marker({ element: planeEl(), anchor: 'center', rotationAlignment: 'map', rotation: 0 }).setLngLat(r.planeAt || CITY_LL[HOME]).addTo(map);
    if (!r.planeAt) G.plane.getElement().style.display = 'none';
    G.timers.push(setInterval(() => { if (G.map !== map) return; const a = map.getSource('night'), b = map.getSource('night2'); if (a) a.setData(lines([night(new Date(), 0)])); if (b) b.setData(lines([night(new Date(), 7)])); }, 60000));
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
  el.innerHTML = captionHtml(ctx, family, r) + `<div id="globe-wrap"><div id="globe"></div></div><div class="where-row"><button class="btn small-btn" id="globe-play">▶ Replay the journey</button><span class="tiny muted">Drag to spin · tap a city · map data © OpenStreetMap contributors, Protomaps</span></div>`;
  try { build(ctx, family); }
  catch (e) { const g = document.getElementById('globe'); if (g) g.outerHTML = `<div class="card">The globe needs a newer phone browser: ${esc((e && e.message) || e)}</div>`; if (window.logErr) logErr('globe: ' + ((e && e.message) || e)); }
  const b = document.getElementById('globe-play');
  if (b) b.onclick = () => { if (!G.map) return; if (G.playing) { stopPlaying(); settle(G.map, G.route, true); } else { G.touched = false; playJourney(G.map, G.route); } };
}
function leave() {
  stopPlaying(); G.idle = false;
  for (const t of G.timers) { clearTimeout(t); clearInterval(t); } G.timers.length = 0;
  if (G.popup) { G.popup.remove(); G.popup = null; }
  for (const m of Object.values(G.markers)) { try { m.remove(); } catch (e) { /* gone */ } } G.markers = {};
  if (G.plane) { try { G.plane.remove(); } catch (e) { /* gone */ } G.plane = null; }
  if (G.map) { const m = G.map; G.map = null; try { m.remove(); } catch (e) { /* already gone */ } }
}

window.Globe = { enter, leave, routeData, legs, arc, split, night, sunPos, isNight, get map() { return G.map; }, get playing() { return G.playing; }, get idle() { return G.idle; } };
