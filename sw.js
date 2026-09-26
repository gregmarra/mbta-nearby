// Service worker: precaches the app shell so the app opens instantly on
// flaky Wi-Fi or with no connection at all. Live MBTA data still needs
// the network; app.js falls back to its localStorage snapshot when offline.
//
// Bump CACHE_NAME on every deploy. Shell files are served
// stale-while-revalidate, so the *next* load after a deploy picks up new
// code even without a bump, but bumping guarantees old caches are purged.
var CACHE_NAME = 'mbta-nearby-v2';

// Paths are relative to the service worker's scope so the app works when
// hosted under a sub-path (e.g. https://example.com/mbta-nearby/).
var APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './favicon.png',
  './favicon.svg',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(APP_SHELL); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// Only same-origin GETs are handled here. API calls (api-v3.mbta.com,
// nominatim) go straight to the network — their responses change every
// few seconds and must never be served stale from this cache.
self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req, { ignoreSearch: true }).then(function(cached) {
        var network = fetch(req).then(function(res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function() { return cached; });
        return cached || network;
      });
    })
  );
});
