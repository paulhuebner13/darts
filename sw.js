const CACHE_NAME = 'darts-trainer-cache-v18-history-clear';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './styles.css?v=13',
  './app.js',
  './app.js?v=13',
  './cricket.html',
  './cricket.css',
  './cricket.css?v=18',
  './cricket.js',
  './cricket.js?v=18',
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
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const url = new URL(event.request.url);
          return caches.match(url.pathname.endsWith('/cricket.html') ? './cricket.html' : './index.html');
        }
        return Response.error();
      })
  );
});
