// WindSwap Service Worker - Caches static assets for offline/instant load

const CACHE_NAME = 'windswap-v2';
const STATIC_ASSETS = [
    '/',
    '/swap',
    '/pools',
    '/portfolio',
    '/vote',
    '/bridge',
    '/logo.png',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch - stale-while-revalidate for HTML, cache-first for static assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and API requests
    if (request.method !== 'GET') return;
    if (request.url.includes('/api/') || request.url.includes('rpc')) return;
    if (request.url.includes('dexscreener') || request.url.includes('subgraph')) return;

    // Static assets: cache-first (faster)
    if (url.pathname.match(/\.(png|jpg|svg|woff2?|js|css)$/)) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // HTML pages: stale-while-revalidate (fast + fresh)
    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached || new Response('Offline', { status: 503 }));

            return cached || fetchPromise;
        })
    );
});
