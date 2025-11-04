const CACHE_NAME = 'qvt-static-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/theme.css',
  '/scripts/env.js',
  '/scripts/voice.js',
  '/scripts/sw-register.js',
  '/manifest.webmanifest',
  '/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests; ignore WS and cross-origin
  if (url.origin !== self.location.origin || request.url.startsWith('ws')) return;

  // Network-first for HTML; cache-first for other static assets
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        return resp;
      }).catch(() => caches.match(request))
    );
  } else {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        return resp;
      }))
    );
  }
});
