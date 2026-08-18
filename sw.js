const CACHE_NAME = 'darts-suite-v29';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './mode-nav.css',
  './cricket.html',
  './cricket.css',
  './cricket-addons.css','./cricket-addons.css?v=29',
  './cricket.js',
  './501.html',
  './501.css','./501.css?v=29',
  './501.js','./501.js?v=29',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
