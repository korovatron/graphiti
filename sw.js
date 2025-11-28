const CACHE_NAME = 'graphiti-v1.481';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './main.js',
    'https://unpkg.com/mathlive',
    'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js',
    './intersection-worker.js',
    './manifest.json',
    './sw.js',
    './logo.png',
    './logoTrans.png',
    './images/graphitiTitle.png'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('Assets cached successfully');
                self.skipWaiting(); // Force activation
            })
            .catch((error) => {
                console.error('Cache failed:', error);
                throw error;
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker activated');
            return self.clients.claim(); // Take control immediately
        })
    );
});

// Fetch event - cache first with network fallback
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                
                return fetch(event.request)
                    .then((response) => {
                        const responseClone = response.clone();
                        
                        if (response.status === 200 && event.request.method === 'GET') {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        
                        return response;
                    });
            })
            .catch((error) => {
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
                throw error;
            })
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});