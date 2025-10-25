const CACHE_NAME = 'graphiti-offline-cache-25-10-2025-16:30';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './main.js',
    './intersection-worker.js',
    './manifest.json',
    './sw.js',
    './logo.png',
    './logoTrans.png',
    './images/graphitiTitle.png',
    'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js',
    'https://unpkg.com/mathlive'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('All assets cached successfully');
                self.skipWaiting(); // Force activation
            })
            .catch((error) => {
                console.log('Cache failed:', error);
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
                        console.log('Deleting old cache:', cacheName);
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

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    console.log('Serving from cache:', event.request.url);
                    return response;
                }
                
                console.log('Fetching from network:', event.request.url);
                return fetch(event.request)
                    .then((response) => {
                        // Clone the response before caching
                        const responseClone = response.clone();
                        
                        // Only cache successful responses
                        if (response.status === 200) {
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        
                        return response;
                    });
            })
            .catch((error) => {
                console.log('Network and cache failed for:', event.request.url);
                // If both cache and network fail, return fallback for documents
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