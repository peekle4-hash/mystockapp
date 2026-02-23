// 버전을 올리면 모든 캐시가 자동 삭제됩니다
const CACHE_VERSION = 'stock-dashboard-v5';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// 설치: 핵심 파일 캐시 (skipWaiting으로 즉시 활성화)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 구버전 캐시 전부 삭제
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => {
        console.log('[SW] 구버전 캐시 삭제:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

// 요청 처리: 네트워크 우선 → 실패 시 캐시 fallback
self.addEventListener('fetch', (e) => {
  // Google Apps Script 요청은 캐시 안 함
  if (e.request.url.includes('script.google.com')) return;
  // non-GET 요청은 캐시 안 함
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // 성공 시 캐시 갱신
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(e.request, copy));
        }
        return res;
      })
      .catch(() => {
        // 오프라인 시 캐시 반환
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

// 메시지 수신: 강제 업데이트 명령
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
