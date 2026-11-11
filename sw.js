/* ANUBIS — service worker : l'app fonctionne hors connexion sur chantier.
   Changer VERSION à chaque mise à jour publiée sur GitHub. */
const VERSION = 'anubis-v1.3.3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'report.js', 'template.js', 'jszip.min.js', 'docx.iife.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Réseau d'abord (pour recevoir les mises à jour), cache si pas de réseau
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
