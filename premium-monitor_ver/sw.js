/* ============================================================
   sw.js — プレミアム版専用の Service Worker (Premium-v119 新規)

   これまでプレミアム版は公開版のルート /sw.js を登録していたため、
   公開版のキャッシュ管理下に入ってしまい、プレミアム版を更新しても
   古いファイルが返り続ける問題があった（スマホのPWAで特に顕著）。
   スコープを /premium-monitor_ver/ に限定した専用SWに分離する。

   方針: ネット優先（network-first）。取得できたら常に最新を表示し、
   オフライン時のみキャッシュから返す。プレミアムは更新が頻繁なので
   事前キャッシュ(precache)は行わず、取得したものを順次保存する。
   ============================================================ */

const CACHE_NAME = 'rsg-premium-v131';

self.addEventListener('install', () => {
  self.skipWaiting(); // 新しいSWを即座に有効化
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('rsg-premium-') && k !== CACHE_NAME)
                      .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
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
