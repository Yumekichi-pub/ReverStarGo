const CACHE_NAME = 'reverstargo-v64';
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
  '/trophy/2030.jpg',
  '/icon/1.png',
  '/icon/2.png',
  '/icon/3.png',
  '/icon/4.png',
  '/icon/5.png',
  '/icon/6.png',
  '/icon/7.png',
  '/icon/8.png',
  '/icon/9.png',
  '/icon/10.png',
  '/icon/11.png',
  '/icon/12.png',
  '/icon/13.png',
  '/icon/14.png',
  '/icon/15.png',
  '/icon/16.png',
  '/icon/17.png',
  '/icon/18.png',
  '/icon/19.png',
  '/icon/20.png',
  '/icon/21.png',
  '/icon/22.png',
  '/icon/23.png',
  '/icon/24.png',
  '/icon/25.png',
  '/icon/26.png',
  '/icon/27.png',
  '/icon/28.png',
  '/icon/29.png',
  '/icon/30.png'
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
