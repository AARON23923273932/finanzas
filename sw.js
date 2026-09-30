// Sube la versión cada vez que cambies archivos, para que el iPhone baje lo nuevo.
const VERSION = 'finanzas-v7'; // igual que APP_VERSION en app.js
const FILES = ['./', 'index.html', 'styles.css', 'charts.js', 'sync.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

// Cada versión se descarga completa y de una vez; si algo falla, la instalación no sigue y queda la anterior.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Los archivos de la app salen siempre de la caché de ESTA versión: rápido, sin internet y sin mezclar
// un app.js viejo con un styles.css nuevo. Lo nuevo llega cuando el navegador instala el sw.js siguiente.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok && r.type === 'basic') c.put(req, r.clone());
    return r;
  }))));
});
