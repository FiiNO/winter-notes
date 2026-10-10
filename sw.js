/* Travel Dossier service worker. Caches the app shell and both encrypted blobs so the app opens in airplane mode.
   The cache name carries the build version; a new build installs a new cache and the old one is deleted.
   Network policy: this worker only ever talks to its own origin. */
const VERSION = 'v09';
const CACHE = 'dossier-' + VERSION;
// Every site file except the tile packs (those are downloaded on demand into OPFS / Cache Storage by map.js).
const SHELL = ['./'].concat(["./app.js", "./family.enc", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon.svg", "./index.html", "./manifest.json", "./map.js", "./style/dark.json", "./style/fonts/Noto Sans Italic/0-255.pbf", "./style/fonts/Noto Sans Italic/256-511.pbf", "./style/fonts/Noto Sans Italic/512-767.pbf", "./style/fonts/Noto Sans Italic/768-1023.pbf", "./style/fonts/Noto Sans Italic/7680-7935.pbf", "./style/fonts/Noto Sans Medium/0-255.pbf", "./style/fonts/Noto Sans Medium/256-511.pbf", "./style/fonts/Noto Sans Medium/512-767.pbf", "./style/fonts/Noto Sans Medium/768-1023.pbf", "./style/fonts/Noto Sans Medium/7680-7935.pbf", "./style/fonts/Noto Sans Regular/0-255.pbf", "./style/fonts/Noto Sans Regular/256-511.pbf", "./style/fonts/Noto Sans Regular/512-767.pbf", "./style/fonts/Noto Sans Regular/768-1023.pbf", "./style/fonts/Noto Sans Regular/7680-7935.pbf", "./style/light.json", "./style/sprites/dark.json", "./style/sprites/dark.png", "./style/sprites/dark@2x.json", "./style/sprites/dark@2x.png", "./style/sprites/light.json", "./style/sprites/light.png", "./style/sprites/light@2x.json", "./style/sprites/light@2x.png", "./styles.css", "./tiles/manifest.json", "./vault.enc", "./vendor/maplibre-gl-shared.mjs", "./vendor/maplibre-gl-worker.mjs", "./vendor/maplibre-gl.css", "./vendor/maplibre-gl.mjs", "./vendor/pmtiles.js", "./version.json"]);

self.addEventListener('install', (event) => {
  // Fetch every shell file fresh from the host ({cache: 'reload'}). GitHub Pages marks files cacheable for ten
  // minutes, and a plain addAll() would happily precache a stale index.html or app.js from the browser's HTTP cache
  // next to a brand-new worker.
  // The versioned query also sidesteps the host's edge cache (GitHub Pages may still serve the previous copy of a
  // plain URL for a few minutes after a deploy). The response is stored under the plain URL the page asks for.
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) =>
      fetch(u + (u.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(VERSION), { cache: 'reload' })
        .then((r) => { if (!r.ok) throw new Error('precache ' + u + ' ' + r.status); return c.put(u, r); })
    ))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;          // never proxy anything off-origin
  if (url.pathname.endsWith('.pmtiles')) return;            // tile packs: straight to the network (range requests) or OPFS
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/tiles/manifest.json')) {
    // network first, so an online check can discover a newer build; fall back to the cached copy offline
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request, { ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
