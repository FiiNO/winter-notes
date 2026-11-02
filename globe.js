/* World Adventure "Where are we" globe (2 Nov 2026). Andy: "a little animation of where we are on the globe". A MapLibre globe
   drawn from one whole-world tile (world.pbf, tile 0/0/0 of the Protomaps pack, precached with the app, so it works offline
   without any tile pack): the route as great-circle legs (flown legs solid in the city colour, the rest dashed), a dot per
   city, a breathing halo on today's city, and a spin from Townsville to where the family is when the screen opens. Shown to
   the family from Home ("🌏 Where are we") and the Book, and as the Where tab on Grandma and Grandpa's phone. Lives on the
   same MapLibre module as map.js; the map is created on enter and removed on leave so a phone never holds two WebGL maps. */
import * as maplibregl from './vendor/maplibre-gl.mjs';

const CITY_LL = { Townsville: [146.82, -19.26], Brisbane: [153.03, -27.47], Cairns: [145.77, -16.92], Vancouver: [-123.12, 49.28], Whistler: [-122.95, 50.12],
  Toronto: [-79.38, 43.65], 'New York': [-74.01, 40.71], 'Montréal': [-73.57, 45.5], Montreal: [-73.57, 45.5], Calgary: [-114.07, 51.05], Tokyo: [139.69, 35.68], Nagoya: [136.91, 35.18] };
const AIRPORT = { TSV: 'Townsville', BNE: 'Brisbane', CNS: 'Cairns', YVR: 'Vancouver', YYZ: 'Toronto', LGA: 'New York', JFK: 'New York', EWR: 'New York', YYC: 'Calgary', NRT: 'Tokyo', HND: 'Tokyo', YUL: 'Montréal' };
const HOME = 'Townsville';
const G = { map: null, world: null, timer: null, big: false };

maplibregl.addProtocol('world', async (params) => {                    // the one tile, from the shell cache
  const m = params.url.match(/^world:\/\/(\d+)\/(\d+)\/(\d+)/);
  if (!m || m[1] !== '0') return { data: new ArrayBuffer(0) };
  if (!G.world) G.world = fetch('./world.pbf').then((r) => { if (!r.ok) throw new Error('world tile ' + r.status); return r.arrayBuffer(); }).catch((e) => { G.world = null; throw e; });
  return { data: (await G.world).slice(0) };
});

/* ---------------------------------------------------------------- the route from the moves */
function placeOf(text) {                                               // a move's frm/to → [city, lonlat]
  const s = String(text || ''), m = s.match(/\(([A-Z]{3})\)/);
  let city = m && AIRPORT[m[1]];
  if (!city) city = Object.keys(CITY_LL).find((c) => s.toLowerCase().includes(c.toLowerCase()));
  return city ? [city, CITY_LL[city]] : null;
}
function legs(family) {
  const out = [];
  for (const mv of (family.moves || [])) {
    const a = placeOf(mv.frm), b = placeOf(mv.to);
    if (a && b && a[0] !== b[0]) out.push({ from: a, to: b, date: mv.date, mode: mv.mode || '', depart: mv.depart || '' });
  }
  return out;
}
function arc(a, b, n) {                                                // great-circle points between two [lon, lat]
  const R = Math.PI / 180, D = 180 / Math.PI, l1 = a[0] * R, p1 = a[1] * R, l2 = b[0] * R, p2 = b[1] * R;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2)), pts = [];
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
function colOf(city) { try { return getComputedStyle(document.documentElement).getPropertyValue('--c-' + (Quests.CITY_KEY[city] || 'home')).trim() || '#2A9D8F'; } catch (e) { return '#2A9D8F'; } }

function routeData(ctx, family) {
  const today = ctx.date, L = legs(family), arr = Quests.arrivals(), lines = [], seen = new Map();
  L.forEach((lg, i) => {
    const done = lg.date < today || (lg.date === today && !ctx.inAir && lg.depart.replace('~', '') <= localTime(ctx.tz));
    for (const seg of split(arc(lg.from[1], lg.to[1], 48))) lines.push({ type: 'Feature', properties: { done, col: colOf(lg.to[0]), i }, geometry: { type: 'LineString', coordinates: seg } });
  });
  const add = (city, when) => { if (CITY_LL[city] && !seen.has(city)) seen.set(city, when); };
  add(HOME, 'Home');
  for (const lg of L) { add(lg.from[0], ''); add(lg.to[0], fmtDate(lg.date)); }
  for (const [c, a] of Object.entries(arr)) add(c, fmtDate(a.date));
  const here = ctx.before ? HOME : ctx.inAir ? null : (ctx.city === 'Home' ? HOME : (CITY_LL[ctx.city] ? ctx.city : null));
  const visited = (city) => city === HOME || (arr[city] && arr[city].date <= today) || L.some((lg) => lg.to[0] === city && lg.date <= today);
  const points = [...seen].map(([city, when]) => ({ type: 'Feature', properties: { name: city, when: when || (arr[city] ? fmtDate(arr[city].date) : ''), col: colOf(city), visited: !ctx.before && visited(city) || city === HOME, now: city === here }, geometry: { type: 'Point', coordinates: CITY_LL[city] } }));
  let target = here ? CITY_LL[here] : null;
  if (ctx.inAir) {                                                     // a plane mid-leg
    const lg = L.find((x) => x.date === today) || L.find((x) => x.date > today) || L[L.length - 1];
    if (lg) { const mid = arc(lg.from[1], lg.to[1], 2)[1]; points.push({ type: 'Feature', properties: { name: '✈️', when: 'In the air', col: '#3A86FF', visited: true, now: true }, geometry: { type: 'Point', coordinates: mid } }); target = mid; }
  }
  return { lines: { type: 'FeatureCollection', features: lines }, points: { type: 'FeatureCollection', features: points }, here, target: target || CITY_LL[HOME], flown: L.filter((lg) => lg.date < today).length, legs: L.length };
}

/* ---------------------------------------------------------------- the map */
function styleOf(r) {
  const base = new URL('.', location.href).href;
  return {
    version: 8, glyphs: base + 'style/fonts/{fontstack}/{range}.pbf', projection: { type: 'globe' },
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    sources: { world: { type: 'vector', tiles: ['world://{z}/{x}/{y}'], minzoom: 0, maxzoom: 0 }, route: { type: 'geojson', data: r.lines }, cities: { type: 'geojson', data: r.points } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#9CD3EA' } },
      { id: 'earth', type: 'fill', source: 'world', 'source-layer': 'earth', paint: { 'fill-color': '#EDE6CF' } },
      { id: 'water', type: 'fill', source: 'world', 'source-layer': 'water', paint: { 'fill-color': '#9CD3EA' } },
      { id: 'bounds', type: 'line', source: 'world', 'source-layer': 'boundaries', paint: { 'line-color': '#C8BFA8', 'line-width': 0.8 } },
      { id: 'leg-todo', type: 'line', source: 'route', filter: ['==', ['get', 'done'], false], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#7D8799', 'line-width': 2.5, 'line-dasharray': [1.5, 2] } },
      { id: 'leg-done', type: 'line', source: 'route', filter: ['==', ['get', 'done'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': 4 } },
      { id: 'halo', type: 'circle', source: 'cities', filter: ['==', ['get', 'now'], true], paint: { 'circle-radius': 14, 'circle-color': ['get', 'col'], 'circle-opacity': 0.35, 'circle-radius-transition': { duration: 650 }, 'circle-opacity-transition': { duration: 650 } } },
      { id: 'dots', type: 'circle', source: 'cities', paint: { 'circle-radius': ['case', ['get', 'now'], 7, 5], 'circle-color': ['case', ['get', 'visited'], ['get', 'col'], '#FFFFFF'], 'circle-stroke-color': ['get', 'col'], 'circle-stroke-width': 2.5 } },
      { id: 'names', type: 'symbol', source: 'cities', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': false }, paint: { 'text-color': '#1B1B2F', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 } },
    ],
  };
}
function captionHtml(ctx, family, r) {
  const grand = Quests.isGrandDevice(), total = Quests.daysBetween(family.trip.start, family.trip.end) + 1, dayN = Quests.daysBetween(family.trip.start, ctx.date) + 1, nm = nextMove(ctx);
  let big, sub;
  if (ctx.before) { big = `${Math.max(0, Quests.daysBetween(ctx.date, family.trip.start))} sleeps to go`; sub = `The whole route, ${r.legs} legs, from ${HOME} and back`; }
  else if (dayN > total) { big = 'Home again 🏡'; sub = `${r.legs} legs flown, ${total} days of adventure`; }
  else { big = `Day ${dayN} of ${total} · ${ctx.inAir ? 'In the air ✈️' : `${ctx.city} ${Quests.CITY_EMOJI[ctx.city] || ''}`}`; sub = `${localTime(ctx.tz)} ${grand ? 'there' : 'here'} · ${localTime(TZ.Home)} at home · ${r.flown} of ${r.legs} legs flown`; }
  const next = nm ? `<div class="small">Next: ${/train/i.test(nm.mode || '') ? '🚆' : /coach|bus/i.test(nm.mode || '') ? '🚌' : '✈️'} ${esc(nm.frm || '')} → ${esc(nm.to || '')} · ${esc(fmtDate(nm.date))}${nm.depart ? ' · ' + esc(nm.depart) : ''}</div>` : '';
  return `<h1 class="h1">🌏 ${grand ? 'Where are they?' : 'Where are we?'}</h1><div class="card where-card"><div class="big">${esc(big)}</div><div class="small muted">${esc(sub)}</div>${next}</div>`;
}
function build(ctx, family) {
  const r = routeData(ctx, family), reduce = window.FX && FX.reduce && FX.reduce();
  const map = new maplibregl.Map({ container: 'globe', style: styleOf(r), center: CITY_LL[HOME], zoom: 1.0, maxPitch: 0, dragRotate: false, touchPitch: false, pitchWithRotate: false, attributionControl: false, fadeDuration: 0 });
  G.map = map;
  map.on('load', () => {
    if (G.map !== map) return;
    const zoom = ctx.before ? 1.4 : 2.3;
    if (reduce) map.jumpTo({ center: r.target, zoom }); else map.flyTo({ center: r.target, zoom, duration: 2600, curve: 1.5, essential: true });
    if (!reduce) G.timer = setInterval(() => { if (G.map !== map) return; G.big = !G.big; map.setPaintProperty('halo', 'circle-radius', G.big ? 24 : 14); map.setPaintProperty('halo', 'circle-opacity', G.big ? 0.12 : 0.4); }, 700);
  });
  map.on('click', 'dots', (e) => {
    const f = e.features && e.features[0]; if (!f) return;
    new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat(f.geometry.coordinates).setHTML(`<div class="where-pop"><b>${esc(f.properties.name)}</b>${f.properties.when ? '<br>' + esc(f.properties.when) : ''}</div>`).addTo(map);
  });
  map.on('mouseenter', 'dots', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'dots', () => { map.getCanvas().style.cursor = ''; });
  map.on('error', (e) => { if (window.logErr && e && e.error) logErr('globe: ' + (e.error.message || e.error)); });
  return r;
}

/* ---------------------------------------------------------------- the screen */
function enter(ctx, family) {
  const el = document.getElementById('screen-where'); if (!el || !family) return;
  leave();
  let r = null;
  try { r = routeData(ctx, family); } catch (e) { el.innerHTML = `<h1 class="h1">🌏 Where are we?</h1><div class="card red">${esc((e && e.message) || e)}</div>`; return; }
  el.innerHTML = captionHtml(ctx, family, r) + `<div id="globe-wrap"><div id="globe"></div></div><p class="tiny muted">Drag to spin · tap a dot · map data © OpenStreetMap contributors, Protomaps</p>`;
  try { build(ctx, family); }
  catch (e) { const g = document.getElementById('globe'); if (g) g.outerHTML = `<div class="card">The globe needs a newer phone browser: ${esc((e && e.message) || e)}</div>`; if (window.logErr) logErr('globe: ' + ((e && e.message) || e)); }
}
function leave() {
  if (G.timer) { clearInterval(G.timer); G.timer = null; }
  if (G.map) { const m = G.map; G.map = null; try { m.remove(); } catch (e) { /* already gone */ } }
}

window.Globe = { enter, leave, routeData, legs, arc, split, get map() { return G.map; } };
