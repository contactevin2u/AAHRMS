/**
 * Service Worker for ESS (Employee Self-Service) PWA
 * Handles caching, offline functionality, and blocks clock-in when offline
 */

const CACHE_NAME = 'ess-pwa-v4';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/ess/login',
  '/ess/dashboard',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json'
];

// Routes that should be cached for offline access
const ESS_ROUTES = [
  '/ess/login',
  '/ess/dashboard',
  '/ess/profile',
  '/ess/payslips',
  '/ess/leave',
  '/ess/claims',
  '/ess/notifications',
  '/ess/letters',
  '/ess/clock-in',
  '/ess/benefits'
];

// Install event - precache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing ESS service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching ESS assets...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Precaching complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Precaching failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating ESS service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name.startsWith('ess-') || name.startsWith('mimix-'))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle caching and offline scenarios
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http(s) requests (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // CRITICAL: Block clock-in API requests when offline
  if (url.pathname.startsWith('/api/ess/clockin')) {
    // For POST requests (actual clock-in actions)
    if (request.method === 'POST') {
      event.respondWith(
        fetch(request)
          .catch(() => {
            // Return special offline error for clock-in
            return new Response(
              JSON.stringify({
                error: 'Clock-in requires internet connection. Please connect to the internet and try again.',
                offline: true,
                code: 'OFFLINE_BLOCKED'
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          })
      );
      return;
    }
  }

  // Skip other non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API requests - network only, with offline error
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Return offline response for API calls
          return new Response(
            JSON.stringify({
              error: 'You are offline. Please check your connection.',
              offline: true
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // For navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached version or offline page
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Return offline page
              return new Response(
                `<!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Offline - Employee Portal</title>
                  <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      min-height: 100vh;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      text-align: center;
                      padding: 20px;
                      color: white;
                    }
                    .card {
                      background: white;
                      border-radius: 16px;
                      padding: 40px 30px;
                      max-width: 400px;
                      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                    }
                    .icon { font-size: 64px; margin-bottom: 20px; }
                    h1 { color: #333; font-size: 24px; margin: 0 0 12px 0; }
                    p { color: #666; font-size: 16px; margin: 0 0 24px 0; line-height: 1.5; }
                    button {
                      background: #1976d2;
                      color: white;
                      border: none;
                      padding: 14px 28px;
                      border-radius: 8px;
                      font-size: 16px;
                      cursor: pointer;
                      transition: background 0.2s;
                    }
                    button:hover { background: #1565c0; }
                    .hint {
                      margin-top: 20px;
                      font-size: 13px;
                      color: #999;
                    }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <div class="icon">📡</div>
                    <h1>You're Offline</h1>
                    <p>Please check your internet connection.<br>Some features require an active connection.</p>
                    <button onclick="location.reload()">Try Again</button>
                    <p class="hint">Clock-in and leave applications require internet.</p>
                  </div>
                </body>
                </html>`,
                {
                  status: 200,
                  headers: { 'Content-Type': 'text/html' }
                }
              );
            });
        })
    );
    return;
  }

  // For other assets (JS, CSS, images) - cache first, then network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update in background
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {});

          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notify clients about online/offline status changes
self.addEventListener('online', () => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'ONLINE_STATUS', online: true });
    });
  });
});

self.addEventListener('offline', () => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'ONLINE_STATUS', online: false });
    });
  });
});
