// service-worker.js — 엠베스트SE 동탄남광장 학습 플랫폼
// [v2 / 0612] HTML·JS는 '네트워크 우선'으로 변경.
//   v1은 캐시 우선(stale-while-revalidate)이라 배포 후 첫 로드가 항상 구버전이었음
//   → "고쳤는데 화면이 안 바뀜" 반복의 근본 원인. v2부터는 온라인이면 항상 최신 코드,
//   오프라인일 때만 캐시 사용. 이미지 등 정적 자원은 기존처럼 캐시 우선(빠른 로딩).

const CACHE_VERSION = 'terrys-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// 핵심 파일들 (오프라인에서도 작동)
const STATIC_FILES = [
  './login.html',
  './student.html',
  './vocab-learn.html',
  './grammar-full.html',
  './rl-storage.js',
  './curriculum-sync.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// 설치 시 핵심 파일 미리 캐싱 (오프라인 폴백용)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW v2] Caching static files');
      return cache.addAll(STATIC_FILES).catch(e => {
        console.warn('[SW v2] Some files failed to cache:', e);
      });
    })
  );
  self.skipWaiting();
});

// 활성화 시 옛 캐시(terrys-v1 포함) 전부 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => {
        console.log('[SW v2] Deleting old cache:', k);
        return caches.delete(k);
      })
    ))
  );
  self.clients.claim();
});

// fetch 전략:
// - HTML / JS / curriculum.json: 네트워크 우선 (항상 최신 코드), 실패 시 캐시(오프라인)
// - GitHub API 등 외부: 캐싱 안 함
// - 이미지 등 나머지 정적 파일: 캐시 우선 (빠른 로딩)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // POST/PUT 등은 캐싱 안 함
  if (event.request.method !== 'GET') return;

  // 외부 API 요청은 그냥 네트워크로
  if (url.hostname.includes('api.github.com') ||
      url.hostname.includes('githubusercontent.com')) {
    return; // 기본 동작 (네트워크)
  }

  const isCode = url.pathname.endsWith('.html')
              || url.pathname.endsWith('.js')
              || url.pathname.endsWith('curriculum.json')
              || event.request.mode === 'navigate'; // 주소창 진입(확장자 없는 경로 포함)

  if (isCode) {
    // ★ 네트워크 우선: 온라인이면 무조건 최신. 성공 응답은 캐시에 갱신 저장.
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request)) // 오프라인 → 캐시 폴백
    );
    return;
  }

  // 이미지 등 나머지: 캐시 우선, 백그라운드 갱신
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        fetch(event.request).then(res => {
          if (res && res.ok) {
            caches.open(STATIC_CACHE).then(c => c.put(event.request, res));
          }
        }).catch(()=>{});
        return cached;
      }
      return fetch(event.request).then(res => {
        if (res && res.ok && url.pathname.endsWith('.png')) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});

// 메시지 수신 — 새 버전 즉시 활성화
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
