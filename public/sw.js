const CACHE_NAME = 'quickmind-shell-v1';
const BASE_URL = new URL('./', self.registration.scope);
const INDEX_URL = new URL('index.html', BASE_URL).toString();
const OFFLINE_URL = new URL('offline.html', BASE_URL).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([BASE_URL.toString(), INDEX_URL, OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match(OFFLINE_URL) : Response.error())),
  );
});
