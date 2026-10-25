const CACHE_NAME = 'rostampour-swro-nv-v45';
const ASSETS = [
  './','./index.html','./desal.html',
  './module.css','./role.js','./shell-tools.js','./plant-specs.js','./report-kit.js','./plant-core.js', './swro-pfd.js','./swro-health.js','./i18n-en.js','./vendor-docx.js',
  './manifest.json','./icon-192.png','./icon-512.png','./favicon-32.png','./apple-touch-icon.png','./report-logo.png','./banner-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf('rostampour-swro-nv') === 0 && k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
