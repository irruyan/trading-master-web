// Only the static app shell is stored. Quotes, snapshots and account data stay on the network.
const CACHE_PREFIX = 'tm-shell-';
// Bump this version whenever a deployed static shell asset changes.
const CACHE = CACHE_PREFIX + '20261008-members-1';
const ROOT = new URL('./', self.registration.scope);
const SHELL = ['index.html', 'app.css', 'runtime-config.js', 'app-runtime.js', 'member-runtime.js', 'manifest.json', 'icon.svg',
               'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const ASSETS = new Set(SHELL.map(path => new URL(path, ROOT).href));
const INDEX = new URL('index.html', ROOT).href;

self.addEventListener('install', event => {
  // A failed asset download must not replace a working installed version.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...ASSETS])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT.origin) return;
  const isHome = event.request.mode === 'navigate' && (url.pathname === ROOT.pathname || url.href === INDEX);
  const key = isHome ? INDEX : url.href;
  if (!ASSETS.has(key)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const stored = await cache.match(key);
    if (stored) return stored;
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') await cache.put(key, response.clone());
    return response;
  }));
});
