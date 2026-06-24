const CACHE = 'virtual-gf-v2';
self.addEventListener('install', (e) => {
  // 跳过等待，立即激活新版本
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.json'])));
});
self.addEventListener('activate', (e) => {
  // 清理旧缓存
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    ))
  );
});
self.addEventListener('fetch', (e) => {
  // 网络优先，失败时回退缓存
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
