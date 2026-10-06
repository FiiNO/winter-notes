/* Mission Dossier service worker. Caches the app shell and both encrypted blobs so the app opens in airplane mode.
   The cache name carries the build version; a new build installs a new cache and the old one is deleted.
   Network policy: this worker only ever talks to its own origin. */
const VERSION = 'v03';
const CACHE = 'dossier-' + VERSION;
const SHELL = [
  './', './index.html', './styles.css', './app.js', './manifest.json',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './family.enc', './vault.enc', './version.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
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
  if (url.pathname.endsWith('/version.json')) {
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
