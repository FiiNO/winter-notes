/* Travel Dossier map (Build Plan v2, Maps module). ES module; app.js talks to it through window.DossierMap.
   - MapLibre GL JS + pmtiles, vendored and pinned. No network requests except this origin (tiles stream from the host
     over range requests when online) and never any analytics.
   - Basemap packs: Protomaps PMTiles cut per area. Downloaded packs live in the Origin Private File System, or in
     Cache Storage where OPFS writing is unavailable (Safari). Tiles are public OSM data and are not encrypted.
   - Overlays come from the decrypted family content (and the vault when it is open); they are never fetched.
   - GPS: watchPosition only while the Map screen is visible; nothing is stored or sent. */
import * as maplibregl from './vendor/maplibre-gl.mjs';

const protocol = new pmtiles.Protocol();          // pmtiles global from vendor/pmtiles.js
maplibregl.addProtocol('pmtiles', protocol.tile);

const TILE_CACHE = 'dossier-tiles';
const LAYER_COLOURS = { stays: '#0B1F3A', moves: '#8A5A00', venues: '#B3261E', emergency: '#2C6B3A', rally: '#5C6670', vault: '#7A1FA2' };
const S = { map: null, container: null, family: null, vaultFeatures: [], manifest: null, styles: {}, theme: 'light',
  activePack: null, overview: null, watchId: null, visible: false, filter: 'all', today: null, onTaxi: null,   // 3 Nov 2026: every place always shows (the Today + tomorrow pill is gone)
  gpsExplained: localStorage.getItem('gpsExplained') === '1', storageKind: null, loadedSources: new Set(), ready: false };

/* ------------------------------------------------------------------ pack storage */
async function opfsRoot() { try { return navigator.storage && navigator.storage.getDirectory ? await navigator.storage.getDirectory() : null; } catch (e) { return null; } }
async function packFile(name) {
  const root = await opfsRoot();
  if (root) { try { const h = await root.getFileHandle(name + '.pmtiles'); const f = await h.getFile(); if (f.size > 0) return f; } catch (e) { /* not in OPFS */ } }
  try { const c = await caches.open(TILE_CACHE); const r = await c.match('tiles/' + name + '.pmtiles'); if (r) return new File([await r.blob()], name + '.pmtiles'); } catch (e) { /* no cache */ }
  return null;
}
async function packDownloaded(name) { return !!(await packFile(name)); }
async function downloadPack(pack, onProgress) {
  const url = pack.file;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  /* 4 Nov 2026 (Andy: "the percentage runs up to 100 but then it says online only"): GitHub Pages gzips a pack when the phone
     asks for gzip, so content-length is the wire size (a few hundred bytes more than the file) and the decoded bytes never
     matched it; every finished download was thrown away as "incomplete". The manifest's size is the truth; content-length
     only stands in when the manifest has none and the body is not encoded. */
  const expected = pack.size || 0, encoded = !!resp.headers.get('content-encoding');
  const total = expected || (encoded ? 0 : +resp.headers.get('content-length') || 0);
  const check = async (size) => { if (expected && size !== expected) { await deletePack(pack.name); throw new Error(`incomplete (${fmtMB(size)} of ${fmtMB(expected)}), try again`); } };
  let got = 0;
  const counted = new TransformStream({ transform(chunk, ctl) { got += chunk.byteLength; if (onProgress) onProgress(got, total); ctl.enqueue(chunk); } });
  const stream = resp.body.pipeThrough(counted);
  const root = await opfsRoot();
  if (root && 'createWritable' in FileSystemFileHandle.prototype) {
    const h = await root.getFileHandle(pack.name + '.pmtiles', { create: true });
    const w = await h.createWritable();
    await stream.pipeTo(w);
    S.storageKind = 'OPFS';
    const f = await h.getFile();
    await check(f.size);
  } else {
    const c = await caches.open(TILE_CACHE);
    await c.put('tiles/' + pack.name + '.pmtiles', new Response(stream, { headers: { 'content-type': 'application/octet-stream' } }));
    S.storageKind = 'Cache Storage';
    await check(got);
  }
}
async function deletePack(name) {
  const root = await opfsRoot();
  if (root) { try { await root.removeEntry(name + '.pmtiles'); } catch (e) { /* absent */ } }
  try { const c = await caches.open(TILE_CACHE); await c.delete('tiles/' + name + '.pmtiles'); } catch (e) { /* absent */ }
}
/* The vendored pmtiles FileSource keys itself by the File's name and ignores a second constructor argument, so the
   style must ask the protocol for exactly that key. Asking for anything else ("local-vancouver", until 31 Oct) made
   the protocol fetch that name from the host, get a 404 and draw nothing: downloaded packs never rendered. */
function localKey(name) { return name + '.pmtiles'; }
async function sourceUrlFor(pack) {
  const f = await packFile(pack.name);
  if (f) {
    const src = new pmtiles.FileSource(f);
    const key = src.getKey();
    if (!S.loadedSources.has(key)) { protocol.add(new pmtiles.PMTiles(src)); S.loadedSources.add(key); }
    return 'pmtiles://' + key;
  }
  return 'pmtiles://' + new URL(pack.file, location.href).href;
}

/* ------------------------------------------------------------------ pack selection */
function inBbox(b, lon, lat) { return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]; }
function detailPacks() { return (S.manifest ? S.manifest.packs : []).filter((p) => !p.always); }
function overviewFor(lon) { const ps = (S.manifest ? S.manifest.packs : []).filter((p) => p.always); return ps.find((p) => inBbox(p.bbox, lon, (p.bbox[1] + p.bbox[3]) / 2)) || ps.find((p) => lon > 100 ? p.name.endsWith('jp') : p.name.endsWith('na')) || ps[0] || null; }
function packForToday(today) { return detailPacks().find((p) => p.dates && p.dates.length === 2 && p.dates[0] <= today && today <= p.dates[1] && !p.name.includes('corridor') && !p.name.includes('narita') && !p.name.includes('sea-to-sky')) || null; }
function firstStop() {                            // the first city pack of the trip by date (3 Nov 2026: before the trip the map opens here on purpose; home has no tiles)
  return detailPacks().filter((p) => p.dates && p.dates.length === 2 && !p.name.includes('corridor') && !p.name.includes('narita') && !p.name.includes('sea-to-sky')).sort((a, b) => a.dates[0].localeCompare(b.dates[0]))[0] || detailPacks()[0] || null;
}
function packAt(lon, lat) { const cands = detailPacks().filter((p) => inBbox(p.bbox, lon, lat)); cands.sort((a, b) => b.maxzoom - a.maxzoom); return cands[0] || null; }

/* ------------------------------------------------------------------ style assembly */
async function loadStyle(theme) {
  if (!S.styles[theme]) {
    const st = await (await fetch('style/' + theme + '.json')).json();
    // MapLibre 6 rejects a relative sprite URL ("must be absolute"), so the basemap icons never loaded; resolve
    // sprite and glyphs against the page (string concat: new URL() would percent-encode the {fontstack} braces).
    const base = new URL('.', location.href).href;
    for (const k of ['sprite', 'glyphs']) if (typeof st[k] === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(st[k])) st[k] = base + st[k].replace(/^\.?\//, '');
    S.styles[theme] = st;
  }
  return JSON.parse(JSON.stringify(S.styles[theme]));
}
async function buildStyle(theme) {
  const st = await loadStyle(theme);
  const detail = S.activePack ? await sourceUrlFor(S.activePack) : null;
  const ov = S.overview ? await sourceUrlFor(S.overview) : null;
  const layers = [];
  if (ov) {
    st.sources.overview = { type: 'vector', url: ov, attribution: st.sources.protomaps.attribution };
    for (const l of st.layers) { if (l.source === 'protomaps') { const c = JSON.parse(JSON.stringify(l)); c.id = 'ov-' + l.id; c.source = 'overview'; c.maxzoom = Math.min(c.maxzoom || 24, (S.overview.maxzoom || 7) + 1); layers.push(c); } else layers.push(l); }
  }
  if (detail) { st.sources.protomaps.url = detail; for (const l of st.layers) if (l.source === 'protomaps') layers.push(l); }
  else delete st.sources.protomaps;
  st.layers = ov || detail ? layers : st.layers.filter((l) => l.source !== 'protomaps');
  // overlays
  st.sources.places = { type: 'geojson', data: overlayData() };
  st.sources.me = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  st.layers.push(
    { id: 'me-acc', type: 'fill', source: 'me', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#1A73E8', 'fill-opacity': 0.15 } },
    { id: 'me-dot-halo', type: 'circle', source: 'me', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 11, 'circle-color': '#FFFFFF' } },
    { id: 'me-dot', type: 'circle', source: 'me', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#1A73E8' } },
    { id: 'places-halo', type: 'circle', source: 'places', paint: { 'circle-radius': 10, 'circle-color': '#FFFFFF', 'circle-opacity': 0.9 } },
    { id: 'places-dot', type: 'circle', source: 'places', paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'layer'], ...Object.entries(LAYER_COLOURS).flat(), '#5C6670'] } },
    { id: 'places-label', type: 'symbol', source: 'places', minzoom: 10, layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name_ja']], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9 }, paint: { 'text-color': theme === 'dark' ? '#EEF2F7' : '#111418', 'text-halo-color': theme === 'dark' ? '#0B1220' : '#FFFFFF', 'text-halo-width': 1.5 } },
  );
  return st;
}
function overlayData() {
  const feats = [...((S.family && S.family.overlay && S.family.overlay.features) || []), ...S.vaultFeatures];
  if (S.filter !== 'today' || !S.today) return { type: 'FeatureCollection', features: feats };
  const t0 = S.today, t1 = addDays(S.today, 1);
  const pack = S.activePack;
  return { type: 'FeatureCollection', features: feats.filter((f) => {
    const p = f.properties;
    if (p.layer === 'vault') return true;
    if (p.date_from && p.date_to) return p.date_from <= t1 && p.date_to >= t0;
    if (pack && (p.layer === 'emergency' || p.layer === 'moves' || p.layer === 'rally')) { const [lon, lat] = f.geometry.coordinates; return inBbox(pack.bbox, lon, lat); }
    return false;
  }) };
}
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/* ------------------------------------------------------------------ map lifecycle */
async function ensureMap() {
  if (S.map) return S.map;
  const el = S.container.querySelector('#map');
  const start = startView();
  S.map = new maplibregl.Map({ container: el, style: await buildStyle(S.theme), center: start.center, zoom: start.zoom, attributionControl: false,
    localIdeographFontFamily: "'Noto Sans JP','Hiragino Sans','Yu Gothic','Meiryo',sans-serif", maxPitch: 0, dragRotate: false, touchPitch: false });
  S.map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: '© OpenStreetMap contributors · Protomaps' }), 'bottom-left');
  S.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  S.map.on('click', 'places-dot', (e) => openCard(e.features[0]));
  S.map.on('mouseenter', 'places-dot', () => { S.map.getCanvas().style.cursor = 'pointer'; });
  S.map.on('moveend', onMoveEnd);
  S.map.on('load', () => { S.ready = true; drawMe(); });
  // Tile or style fetch failures used to vanish into the console; show the last one on the pack bar and in the
  // Offline maps panel so a blank map on a phone can be reported with its reason.
  S.map.on('error', (e) => {
    const m = String((e && e.error && e.error.message) || '');
    if (!/404|40[0-9]|50[0-9]|Bad response|Failed to fetch|NetworkError|HTTP|range|Invalid/i.test(m)) return;
    S.lastError = m.slice(0, 160);
    const b = S.container.querySelector('#map-packbar'); if (b) b.textContent = '⚠ Map tiles failed: ' + S.lastError.slice(0, 60);
  });
  return S.map;
}
function startView() {
  const pack = S.activePack || S.overview;
  if (pack) { const b = pack.bbox; return { center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], zoom: pack.always ? 4 : 12 }; }
  return { center: [139.81, 35.69], zoom: 11 };
}
async function onMoveEnd() {
  if (!S.map || S.switching) return;
  const c = S.map.getCenter();
  const want = packAt(c.lng, c.lat);
  const ov = overviewFor(c.lng);
  const outside = !want;
  S.container.querySelector('#map-outside').classList.toggle('hidden', !outside);
  if (outside) S.container.querySelector('#map-outside a').href = `https://www.google.com/maps/@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${Math.round(S.map.getZoom())}z`;
  if ((want && (!S.activePack || want.name !== S.activePack.name)) || (ov && (!S.overview || ov.name !== S.overview.name))) {
    S.switching = true;
    if (want) S.activePack = want;
    if (ov) S.overview = ov;
    try { S.map.setStyle(await buildStyle(S.theme), { diff: false }); } finally { setTimeout(() => { S.switching = false; }, 300); }
    renderPackBar();
  }
}
function refreshOverlay() { if (S.map && S.map.getSource('places')) S.map.getSource('places').setData(overlayData()); }

/* ------------------------------------------------------------------ marker card */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function openCard(f) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const name = p.name_en || p.name_ja || '';
  const btn = (href, label, cls = '') => `<a class="btn ${cls}" href="${href}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${label}</a>`;
  const card = S.container.querySelector('#map-card');
  card.innerHTML = `<button class="btn" id="map-card-close" style="float:right">Close</button>
    <div class="h3">${esc(name)}${p.name_ja && p.name_en ? `<div class="ja small">${esc(p.name_ja)}</div>` : ''}</div>
    <div class="small">${esc(p.address_en || '')}</div>${p.address_ja ? `<div class="small">${esc(p.address_ja)}</div>` : ''}
    <div class="mono small">${lat.toFixed(5)}, ${lon.toFixed(5)} · ${esc(p.plus_code || '')}</div>
    ${p.dates ? `<div class="small muted">${esc(p.dates)}</div>` : ''}${p.notes ? `<div class="tiny muted">${esc(p.notes)}</div>` : ''}
    <div class="row">
      ${p.taxi_card_id ? `<button class="btn" data-taxi="${esc(p.taxi_card_id)}">Taxi card</button>` : ''}
      ${typeof mapButtons === 'function' ? mapButtons(lat, lon, name)   /* app.js: Google Maps first while online, Organic Maps when not (6 Nov 2026) */
        : btn(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, 'Google Maps') + btn(`om://map?v=1&ll=${lat},${lon}&n=${encodeURIComponent(name)}`, 'Organic Maps')}
      ${p.phone ? btn('tel:' + String(p.phone).replace(/[^\d+]/g, ''), 'Call') : ''}
    </div>`;
  card.classList.remove('hidden');
  card.querySelector('#map-card-close').onclick = () => card.classList.add('hidden');
  const t = card.querySelector('[data-taxi]'); if (t) t.onclick = () => { if (S.onTaxi) S.onTaxi(t.dataset.taxi); };
}

/* ------------------------------------------------------------------ GPS */
function startGps() {
  if (S.watchId != null || !navigator.geolocation) return;
  S.watchId = navigator.geolocation.watchPosition((pos) => {
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    S.me = { lat, lon, accuracy }; S.meAt = Date.now();
    const b = S.container.querySelector('#map-gps-state'); if (b) b.textContent = packAt(lon, lat) ? `You: ±${Math.round(accuracy)} m` : 'You are outside the offline maps · ◉ Me goes there';   // the element itself arrived 6 Nov 2026: the Map screen never had one
    if (S.centreWanted && S.map) { S.centreWanted = false; S.autoCentre = false; S.map.easeTo({ center: [lon, lat], zoom: Math.max(S.map.getZoom(), 15) }); }   // the tap on ◉ Me waits for this first fix (3 Nov 2026)
    else autoCentre();
    drawMe();
  }, (err) => { const b = S.container.querySelector('#map-gps-state'); if (b) b.textContent = err.code === 1 ? 'location blocked' : 'no fix yet'; },
  { enableHighAccuracy: true, maximumAge: 5000, timeout: 60000 });
}
function drawMe() {                                // the blue dot and its accuracy ring, once the map has its source (a fix can beat the style; the map's load calls this again)
  if (!S.me || !S.map || !S.map.getSource('me')) return;
  const { lat, lon, accuracy } = S.me;
  S.map.getSource('me').setData({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} },
    { type: 'Feature', geometry: circlePolygon(lon, lat, accuracy || 0), properties: {} }] });
}
function stopGps() { if (S.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(S.watchId); S.watchId = null; }
function circlePolygon(lon, lat, r) {
  const pts = []; const dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * 2 * Math.PI; pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return { type: 'Polygon', coordinates: [pts] };
}
/* 6 Nov 2026 (Andy: "when you open maps I want it to centre on me"): once per opening, on the first fresh fix, and only where
   a trip map covers the spot. At home or in the air the map stays on the trip city (centring there opens a blank map); the
   📍 button still goes to the dot anywhere. */
function autoCentre() {
  if (!S.autoCentre || !S.map || !S.me || !S.meAt || Date.now() - S.meAt > 15000) return;
  S.autoCentre = false;
  if (packAt(S.me.lon, S.me.lat)) window.DossierMap.focus(S.me.lat, S.me.lon, Math.max(S.map.getZoom(), 15));
}
function centreOnMe() {
  if (!S.gpsExplained) {
    const ok = confirm('The map can show a blue dot where you are. Location is used only on this screen, never stored or sent. Allow?');
    if (!ok) return; S.gpsExplained = true; localStorage.setItem('gpsExplained', '1');
  }
  S.centreWanted = true;                           // 3 Nov 2026: the first tap used to start the GPS and stop there; now the first fix centres the map
  startGps();
  if (S.me && S.map) { S.centreWanted = false; S.map.easeTo({ center: [S.me.lon, S.me.lat], zoom: Math.max(S.map.getZoom(), 15) }); }
}

/* ------------------------------------------------------------------ offline packs panel */
function fmtMB(b) { return (b / 1e6).toFixed(b > 1e8 ? 0 : 1) + ' MB'; }
async function renderPacks() {
  const el = S.container.querySelector('#map-packs');
  if (!S.manifest) { el.innerHTML = '<div class="small muted">No tile packs in this build yet.</div>'; return; }
  const rows = [];
  for (const p of S.manifest.packs) {
    const f = await packFile(p.name);
    const have = !!f, whole = !f || !p.size || f.size === p.size;
    const status = !have ? '<span class="chip">online only</span>' : whole ? `<span class="chip">offline ✓</span>` : `<span class="chip red">incomplete</span><br><span class="tiny muted">${fmtMB(f.size)} stored</span>`;
    const action = have && whole ? `<button class="btn" data-del="${esc(p.name)}">Delete</button>` : `<button class="btn" data-get="${esc(p.name)}">${have ? 'Download again' : 'Download'}</button>`;
    rows.push(`<tr data-pack="${esc(p.name)}"><td><b>${esc(p.title)}</b><br><span class="tiny muted">z${p.maxzoom} · ${p.dates && p.dates.length ? esc(p.dates.join(' to ')) : 'always'}</span></td><td>${fmtMB(p.size)}</td><td class="pack-status">${status}</td><td>${action}</td></tr>`);
  }
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  el.innerHTML = `<table class="t"><tr><th>Pack</th><th>Size</th><th>Status</th><th></th></tr>${rows.join('')}</table>
    <div class="row"><button class="btn primary" id="packs-all">Download all for the trip (on Wi-Fi)</button></div>
    <div class="tiny muted">${est ? `Storage: ${fmtMB(est.usage || 0)} used of ${fmtMB(est.quota || 0)}.` : ''} ${persisted === true ? 'Persistent storage granted.' : persisted === false ? 'Persistent storage not granted yet.' : ''} ${S.storageKind ? 'Packs kept in ' + S.storageKind + '.' : ''} Built ${esc((S.manifest.packs[0] || {}).built || '')}, planet ${esc((S.manifest.packs[0] || {}).planet || '')}.</div>
    ${S.lastError ? `<div class="tiny" style="color:var(--red)">Last map error: ${esc(S.lastError)}</div>` : ''}`;
  el.querySelectorAll('[data-get]').forEach((b) => b.onclick = () => getPack(b.dataset.get));
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await deletePack(b.dataset.del); S.loadedSources.delete(localKey(b.dataset.del)); renderPacks(); });
  el.querySelector('#packs-all').onclick = async () => { for (const p of S.manifest.packs) if (!(await packDownloaded(p.name))) await getPack(p.name); };
}
async function getPack(name) {
  const p = S.manifest.packs.find((x) => x.name === name); if (!p) return;
  const row = S.container.querySelector(`tr[data-pack="${name}"] .pack-status`);
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    await downloadPack(p, (got, total) => { if (row) row.textContent = total ? Math.round(100 * got / total) + '%' : fmtMB(got); });
    S.loadedSources.delete(localKey(name));
    S.lastError = null;
    if (S.activePack && S.activePack.name === name || S.overview && S.overview.name === name) { S.map && S.map.setStyle(await buildStyle(S.theme), { diff: false }); renderPackBar(); }
  } catch (e) { S.lastError = `${p.title} download failed: ${e.message || e}`; }   // renderPacks shows it under the table (the row's own text is redrawn at once)
  renderPacks();
}
function renderPackBar() {
  const el = S.container.querySelector('#map-packbar'); if (!el) return;
  const pre = S.preTrip && S.activePack && S.activePack.name === S.firstStopName ? ' · the first stop (home has no map tiles)' : '';
  el.textContent = S.activePack ? `${S.activePack.title} · z${S.activePack.maxzoom}${pre}` : (S.overview ? 'Overview only here' : 'No packs');
}

/* ------------------------------------------------------------------ public API */
window.DossierMap = {
  async mount(opts) {
    S.container = opts.container; S.family = opts.family; S.theme = opts.theme === 'dark' ? 'dark' : 'light';
    S.today = opts.today; S.onTaxi = opts.onTaxi || null;
    if (!S.manifest) { try { S.manifest = await (await fetch('tiles/manifest.json')).json(); } catch (e) { S.manifest = null; } }
    const first = firstStop();
    S.firstStopName = first ? first.name : null; S.preTrip = !!(first && !packForToday(S.today) && S.today < first.dates[0]);
    S.activePack = S.activePack || packForToday(S.today) || first;
    S.overview = S.activePack ? overviewFor((S.activePack.bbox[0] + S.activePack.bbox[2]) / 2) : overviewFor(139);
    S.container.querySelector('#map-filter').onclick = (e) => { const b = e.target.closest('[data-filter]'); if (!b) return; S.filter = b.dataset.filter; S.container.querySelectorAll('#map-filter .pill').forEach((p) => p.classList.toggle('active', p === b)); refreshOverlay(); };
    S.container.querySelector('#map-me').onclick = centreOnMe;
    S.container.querySelector('#map-packs-toggle').onclick = () => { const p = S.container.querySelector('#map-packs'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) renderPacks(); };
    await ensureMap();
    renderPackBar();
    setTimeout(() => S.map && S.map.resize(), 50);
    autoCentre();                                    // a fix that arrived while the map was still being built
  },
  setVisible(v) {
    S.visible = v;
    if (!v) { stopGps(); return; }
    if (S.map) setTimeout(() => S.map.resize(), 50);
    if (!S.gpsExplained && !localStorage.getItem('gpsAsked')) {      // asked once, the first time the Map opens (6 Nov 2026); 📍 asks again if this was a no
      localStorage.setItem('gpsAsked', '1');
      if (confirm('Open the map centred on where you are? Location is used only on this screen, never stored or sent.')) { S.gpsExplained = true; localStorage.setItem('gpsExplained', '1'); }
    }
    if (S.gpsExplained) { S.autoCentre = true; startGps(); }         // each opening centres once on the first fresh fix, where a trip map covers it
  },
  async setTheme(theme) { const t = theme === 'dark' ? 'dark' : 'light'; if (t === S.theme) return; S.theme = t; if (S.map) S.map.setStyle(await buildStyle(t), { diff: false }); },
  setVaultFeatures(features) { S.vaultFeatures = features || []; refreshOverlay(); },
  async focus(lat, lon, zoom = 15) {
    const want = packAt(lon, lat); if (want && (!S.activePack || want.name !== S.activePack.name)) { S.activePack = want; S.overview = overviewFor(lon); if (S.map) S.map.setStyle(await buildStyle(S.theme), { diff: false }); renderPackBar(); }
    if (S.map) S.map.jumpTo({ center: [lon, lat], zoom });
  },
  focusPlace(id) { const f = ((S.family.overlay || {}).features || []).find((x) => x.properties.id === id); if (f) { const [lon, lat] = f.geometry.coordinates; this.focus(lat, lon); openCard(f); } },
  hasPacks() { return !!(S.manifest && S.manifest.packs.length); },
  get map() { return S.map; },                     // tests
};
