const CACHE_NAME = 'reverstargo-v15';
const ASSETS = [
  '/',
  '/index.html',
  '/bg.jpg',
  '/icon.png',
  '/favicon.png',
  '/ogp.jpg',
  '/manifest.json',
  '/trophy/1.jpg',
  '/trophy/2.jpg',
  '/trophy/3.jpg',
  '/trophy/4.jpg',
  '/trophy/5.jpg',
  '/trophy/6.jpg',
  '/trophy/7.jpg',
  '/trophy/8.jpg',
  '/trophy/9.jpg',
  '/trophy/10.jpg',
  '/trophy/11.jpg',
  '/trophy/12.jpg',
  '/trophy/2026.jpg',
  '/trophy/2027.jpg',
  '/trophy/2028.jpg',
  '/trophy/2029.jpg',
  '/trophy/2030.jpg'
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
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
