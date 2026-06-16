// public/player/sw.js
const CACHE = 'alios-v1';
const ASSETS = ['/', '/index.html', '/styles.css', '/cutscene.css', '/app.js', '/manifest.json', '/sounds/allie-chime.mp3'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // never cache API or socket traffic
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
