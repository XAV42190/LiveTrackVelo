const CACHE_NAME = 'livetrack-v1';
const ASSETS = [
  './index.html',
  './app.js',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Installation : Mise en cache des fichiers essentiels pour l'accès hors-ligne
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Interception des requêtes : Permet à l'application de fonctionner même sans réseau stable
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

// Écoute de la synchronisation en arrière-plan (Background Sync API)
// Si le téléphone perd la 4G dans les bois, il garde les points GPS en mémoire et les envoie dès que le réseau revient
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-gps-data') {
    event.waitUntil(envoyerDonneesEnAttente());
  }
});