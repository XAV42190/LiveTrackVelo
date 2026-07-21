// Incrément de version pour forcer la purge du cache mobile
const CACHE_NAME = 'livetrack-v811';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Récupération directe sur le réseau sans bloquer sur l'ancien cache
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
