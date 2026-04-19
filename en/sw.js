const CACHE_NAME = 'reverstargo-en-v37';
const ASSETS = [
  '/en/',
  '/en/index.html',
  '/en/bg.jpg',
  '/en/icon.png',
  '/en/favicon.png',
  '/en/ogp.jpg',
  '/en/manifest.json',
  '/en/trophy/1.jpg',
  '/en/trophy/2.jpg',
  '/en/trophy/3.jpg',
  '/en/trophy/4.jpg',
  '/en/trophy/5.jpg',
  '/en/trophy/6.jpg',
  '/en/trophy/7.jpg',
  '/en/trophy/8.jpg',
  '/en/trophy/9.jpg',
  '/en/trophy/10.jpg',
  '/en/trophy/11.jpg',
  '/en/trophy/12.jpg',
  '/en/trophy/2026.jpg',
  '/en/trophy/2027.jpg',
  '/en/trophy/2028.jpg',
  '/en/trophy/2029.jpg',
  '/en/trophy/2030.jpg',
  '/en/icon/1.png',
  '/en/icon/2.png',
  '/en/icon/3.png',
  '/en/icon/4.png',
  '/en/icon/5.png',
  '/en/icon/6.png',
  '/en/icon/7.png',
  '/en/icon/8.png',
  '/en/icon/9.png',
  '/en/icon/10.png',
  '/en/icon/11.png',
  '/en/icon/12.png',
  '/en/icon/13.png',
  '/en/icon/14.png',
  '/en/icon/15.png',
  '/en/icon/16.png',
  '/en/icon/17.png',
  '/en/icon/18.png',
  '/en/icon/19.png',
  '/en/icon/20.png',
  '/en/icon/21.png',
  '/en/icon/22.png',
  '/en/icon/23.png',
  '/en/icon/24.png',
  '/en/icon/25.png',
  '/en/icon/26.png',
  '/en/icon/27.png',
  '/en/icon/28.png',
  '/en/icon/29.png',
  '/en/icon/30.png'
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
