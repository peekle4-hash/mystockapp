const CACHE_NAME = 'stock-dashboard-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './auth.js',
  './styles.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // supabase, google 인증 요청은 캐시 안 함
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('accounts.google.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => {
        if (e.request.destination === 'document') return caches.match('./index.html');
      });
    })
  );
});
