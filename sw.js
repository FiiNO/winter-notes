/* Travel Dossier service worker. Caches the app shell and both encrypted blobs so the app opens in airplane mode.
   The cache name carries the build version; a new build installs a new cache and the old one is deleted.
   Network policy: this worker only ever talks to its own origin. */
/* The build's number is written in three places and they must agree: here, index.html (<body data-version>) and
   version.json (version, label). 18 Nov 2026: v51 changed two of the three, so a phone that took it still called itself
   v50 and offered "New build v51" for good, PIN and all, however often Update was tapped. */
const VERSION = 'v58';
const CACHE = 'dossier-' + VERSION;
// Every site file except the tile packs (those are downloaded on demand into OPFS / Cache Storage by map.js).
const SHELL = ['./'].concat(["./app.js", "./book.js", "./check.html", "./compat.js", "./family.enc", "./fonts/LICENSE.txt", "./fonts/abril-fatface.woff2", "./fonts/alfa-slab-one.woff2", "./fonts/amatic-sc-bold.woff2", "./fonts/bebas-neue.woff2", "./fonts/gochi-hand.woff2", "./fonts/handlee.woff2", "./fonts/kalam.woff2", "./fonts/limelight.woff2", "./fonts/pacifico.woff2", "./fonts/patrick-hand.woff2", "./fonts/playfair-display-black-italic.woff2", "./fx.js", "./globe.js", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png", "./icons/icon.svg", "./index.html", "./journal.js", "./manifest.json", "./map.js", "./media.js", "./postcard.js", "./quests.js", "./style/dark.json", "./style/fonts/Noto Sans Italic/0-255.pbf", "./style/fonts/Noto Sans Italic/256-511.pbf", "./style/fonts/Noto Sans Italic/512-767.pbf", "./style/fonts/Noto Sans Italic/768-1023.pbf", "./style/fonts/Noto Sans Italic/7680-7935.pbf", "./style/fonts/Noto Sans Medium/0-255.pbf", "./style/fonts/Noto Sans Medium/256-511.pbf", "./style/fonts/Noto Sans Medium/512-767.pbf", "./style/fonts/Noto Sans Medium/768-1023.pbf", "./style/fonts/Noto Sans Medium/7680-7935.pbf", "./style/fonts/Noto Sans Regular/0-255.pbf", "./style/fonts/Noto Sans Regular/256-511.pbf", "./style/fonts/Noto Sans Regular/512-767.pbf", "./style/fonts/Noto Sans Regular/768-1023.pbf", "./style/fonts/Noto Sans Regular/7680-7935.pbf", "./style/light.json", "./style/sprites/dark.json", "./style/sprites/dark.png", "./style/sprites/dark@2x.json", "./style/sprites/dark@2x.png", "./style/sprites/light.json", "./style/sprites/light.png", "./style/sprites/light@2x.json", "./style/sprites/light@2x.png", "./styles.css", "./sync.js", "./tickets.enc", "./tickets.js", "./tiles/manifest.json", "./vaultdocs.js", "./vault.enc", "./vendor/maplibre-gl-shared.mjs", "./vendor/maplibre-gl-worker.mjs", "./vendor/maplibre-gl.css", "./vendor/maplibre-gl.mjs", "./vendor/pmtiles.js", "./version.json", "./world.tiles"]);

self.addEventListener('install', (event) => {
  // Fetch every shell file fresh from the host ({cache: 'reload'}). GitHub Pages marks files cacheable for ten
  // minutes, and a plain addAll() would happily precache a stale index.html or app.js from the browser's HTTP cache
  // next to a brand-new worker.
  // The versioned query also sidesteps the host's edge cache (GitHub Pages may still serve the previous copy of a
  // plain URL for a few minutes after a deploy). The response is stored under the plain URL the page asks for.
  // 15 Nov 2026: a file already in this build's cache is not fetched again. One failed file still fails the install
  // (the old build keeps running), but the next try picks up where this one stopped: on hotel Wi-Fi or roaming an
  // update used to start again from nothing every time one of the fifty-odd files dropped.
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) =>
      c.match(u).then((have) => have || fetch(u + (u.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(VERSION), { cache: 'reload' })
        .then((r) => { if (!r.ok) throw new Error('precache ' + u + ' ' + r.status); return c.put(u, r); }))
    ))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Older builds' caches go. 'dossier-tiles' stays: Safari's downloaded map packs live there (map.js), and a new
    // build must not wipe them. Only this app's own caches are touched (15 Nov 2026: it used to delete every cache
    // on the origin, whoever made it).
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf('dossier-') === 0 && k !== CACHE && k !== 'dossier-tiles').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const cached = (request) => caches.open(CACHE).then((c) => c.match(request, { ignoreSearch: true }));
/* The network first, so an online check can discover a newer build; the cached copy when the network fails, answers
   with an error, or says nothing for `ms` (15 Nov 2026: on Wi-Fi with no internet behind it the request hung until
   the connection timed out, and the offline map sat on "Loading map…" all that time). */
function networkFirst(request, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => cached(request).then(finish), ms);
    fetch(request).then(
      (r) => { clearTimeout(timer); if (r.ok) finish(r); else cached(request).then((hit) => finish(hit || r)); },
      () => { clearTimeout(timer); cached(request).then((hit) => finish(hit || Response.error())); }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;          // never proxy anything off-origin
  if (url.pathname.endsWith('.pmtiles')) return;            // tile packs: straight to the network (range requests) or OPFS
  if (url.search.indexOf('probe=') >= 0) return;            // app.js Net.ask: "is there really internet?" must never be answered from the cache
  if (url.pathname.endsWith('/version.json')) { event.respondWith(networkFirst(event.request, 8000)); return; }
  if (url.pathname.endsWith('/tiles/manifest.json')) { event.respondWith(networkFirst(event.request, 3000)); return; }
  event.respondWith(cached(event.request).then((hit) => hit || fetch(event.request)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
