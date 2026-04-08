const CACHE_NAME = 'reverstargo-v03';
const ASSETS = [
  '/',
  '/index.html',
  '/logo.jpg',
  '/logo.png',
  '/bg.jpg',
  '/icon.png',
  '/favicon.png',
  '/ogp.jpg',
  '/manifest.json',
  '/trophy_1.png',
  '/trophy_2.png',
  '/trophy_3.png',
  '/trophy_4.png',
  '/trophy_5.png',
  '/trophy_6.png',
  '/trophy_7.png',
  '/trophy_8.png',
  '/trophy_9.png',
  '/trophy_10.png',
  '/trophy_11.png',
  '/trophy_12.png',
  '/trophy_2026.png',
  '/trophy_2027.png',
  '/trophy_2028.png',
  '/trophy_2029.png',
  '/trophy_2030.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
