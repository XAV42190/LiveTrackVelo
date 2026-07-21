// ⚠️ Augmentez le chiffre ici (v101, v102...) à CHAQUE modification sur GitHub !
const CACHE_NAME = 'livetrack-v102'; 

const assets = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// Installation : force le Service Worker à s'installer sans attendre
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assets);
    })
  );
});

// Activation : NETTOIE AUTOMATIQUEMENT LES ANCIENS CACHES
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Suppression de l ancien cache :', cache);
            return caches.delete(cache); // <--- C'est cette ligne qui vide le vieux cache sur le téléphone
          }
        })
      );
    })
  );
  self.clients.claim();
});
