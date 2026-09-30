// 주식트레이딩마스터 — 최소 서비스워커 (PWA 설치/오프라인 셸)
// 캐시 버전을 올리면 activate 시 옛 캐시를 자동 삭제 → 모든 사용자 브라우저가 새로 받음.
const CACHE = 'tm-shell-v14';
const SHELL = ['./', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 시세/계산 API는 항상 네트워크 (국내 /api/* + 글로벌 /global/api/* 모두 캐시 금지)
  if (/\/api(\/|$)/.test(url.pathname)) return;
  // 셸은 네트워크 우선, 실패 시 캐시 폴백
  e.respondWith(
    fetch(e.request)
      .then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request))
  );
});
