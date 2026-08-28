const CACHE_NAME = 'graphiti-v1.3.89';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './guide.html',
    './a-level-maths-graphing-calculator.html',
    './automatic-asymptote-detection.html',
    './curve-identifier-graphing-calculator.html',
    './implicit-equation-graphing-calculator.html',
    './polar-graphing-calculator.html',
    './parametric-equation-graphing-calculator.html',
    './integration-area-graphing-calculator.html',
    './inequality-graphing-calculator.html',
    './interactive-tangents-normals-graphing-calculator.html',
    './main.js',
    'https://unpkg.com/mathlive',
    'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_AMS-Regular.woff2',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Bold.woff2',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Italic.woff2',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Regular.woff2',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-Italic.woff2',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size1-Regular.woff2',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size2-Regular.woff2',
    './intersection-worker.js',
    './manifest.json',
    './sw.js',
    './logo.png',
    './logoTrans.png',
    './images/graphitiTitle.png',
    './images/graphitiShareImage1.png',
    './images/graphitiFeatures/asymptopes.png',
    './images/graphitiFeatures/shapeDetection.png',
    './images/graphitiFeatures/implicit.png',
    './images/graphitiFeatures/polar.png',
    './images/graphitiFeatures/parametric.png',
    './images/graphitiFeatures/definiteIntegral.png',
    './images/graphitiFeatures/areaBetweenCurves.png',
    './images/graphitiFeatures/inequalityIntersections.png',
    './images/graphitiFeatures/interactiveTangentsNormals.png',
    './images/yt_icon_white_digital.png'
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

// Fetch event - cache first with network fallback and timeout
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    // For navigation requests (opening the app), use aggressive cache-first with short timeout
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        // Serve cached version immediately
                        // Update in background with timeout
                        fetchWithTimeout(event.request, 2000)
                            .then((freshResponse) => {
                                if (freshResponse.status === 200) {
                                    caches.open(CACHE_NAME).then((cache) => {
                                        cache.put(event.request, freshResponse.clone());
                                    });
                                }
                            })
                            .catch(() => {}); // Ignore timeout/errors in background
                        
                        return cachedResponse;
                    }
                    
                    // No cache, try network with short timeout
                    return fetchWithTimeout(event.request, 2000)
                        .catch(async () => {
                            const fallback = await caches.match('./index.html');
                            return fallback || new Response('Offline', {
                                status: 503,
                                statusText: 'Offline'
                            });
                        });
                })
                .catch(async () => {
                    const fallback = await caches.match('./index.html');
                    return fallback || new Response('Offline', {
                        status: 503,
                        statusText: 'Offline'
                    });
                })
        );
        return;
    }
    
    // For other requests, use standard cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    // Found in cache, return immediately
                    // But also update cache in background for next time
                    fetchWithTimeout(event.request, 5000)
                        .then((freshResponse) => {
                            if (freshResponse.status === 200 && event.request.method === 'GET') {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(event.request, freshResponse.clone());
                                });
                            }
                        })
                        .catch(() => {}); // Ignore network errors in background update
                    
                    return response;
                }
                
                // Not in cache, fetch with timeout to handle slow networks
                return fetchWithTimeout(event.request, 5000)
                    .then((response) => {
                        const responseClone = response.clone();
                        
                        if (response.status === 200 && event.request.method === 'GET') {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        
                        return response;
                    })
                    .catch(async () => {
                        if (event.request.destination === 'document') {
                            const fallbackDoc = await caches.match('./index.html');
                            if (fallbackDoc) {
                                return fallbackDoc;
                            }
                        }

                        const fallbackAsset = await caches.match(event.request, { ignoreSearch: true });
                        if (fallbackAsset) {
                            return fallbackAsset;
                        }

                        return new Response('', {
                            status: 504,
                            statusText: 'Gateway Timeout'
                        });
                    });
            })
            .catch(async () => {
                if (event.request.destination === 'document') {
                    const fallbackDoc = await caches.match('./index.html');
                    if (fallbackDoc) {
                        return fallbackDoc;
                    }
                }

                const fallbackAsset = await caches.match(event.request, { ignoreSearch: true });
                if (fallbackAsset) {
                    return fallbackAsset;
                }

                return new Response('', {
                    status: 504,
                    statusText: 'Gateway Timeout'
                });
            })
    );
});

// Fetch with timeout helper
function fetchWithTimeout(request, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(request, { signal: controller.signal })
        .finally(() => {
            clearTimeout(timeoutId);
        });
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});