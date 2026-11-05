// Chatzy service worker: keeps the app shell so a dropped connection shows Chatzy's own offline screen
// (not the browser's grey "No internet" page). API calls are never cached.
const CACHE = 'chatzy-shell-v1';
const SHELL = ['/', '/offline.html', '/icon.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // backend / media / sockets go straight to the network
  if (url.pathname.endsWith('.apk') || url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {                                   // pages: network first, then the saved shell, then the offline page
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && url.pathname === '/') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
        return res;
      }).catch(() => caches.match('/').then((r) => r || caches.match('/offline.html'))),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {                       // hashed build files never change: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
