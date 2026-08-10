/* Service worker: приложение целиком кладётся в кэш и работает офлайн.
   При изменении файлов поднимите VERSION — старый кэш будет удалён. */

const VERSION = 'v1';
const CACHE = `percent-calc-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Переходы: сначала сеть (чтобы подхватить обновление), иначе кэш.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          store(req, res.clone());
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Остальное: сначала кэш, обновление подтягивается в фоне.
  event.respondWith(
    caches.match(req).then((hit) => {
      const fromNetwork = fetch(req)
        .then((res) => {
          if (res && res.ok) store(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fromNetwork;
    })
  );
});

function store(req, res) {
  caches.open(CACHE).then((cache) => cache.put(req, res)).catch(() => { /* кэш переполнен */ });
}
