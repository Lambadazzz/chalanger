const prefix = 'chalanger:' + self.registration.scope + ':';
const cacheName = prefix + '__CHALANGER_BUILD__';
const assets = [
  './', './index.html', './style.css', './app.js', './album.js', './gestures.js',
  './generator.css', './generator.js', './idea-bank.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];
const cachedUrls = new Set(assets.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    assets.map(url => new Request(url, { cache: 'reload' }))
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(cacheName).then(async cache =>
      (await cache.match('./index.html')) ?? fetch(event.request)));
  } else if (cachedUrls.has(url.href)) {
    event.respondWith(caches.open(cacheName).then(async cache =>
      (await cache.match(event.request)) ?? fetch(event.request)));
  }
});
