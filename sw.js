// ═══════════════════════════════════════════════════════
//  OGC Rastede – Service Worker
//  Oldenburgischer Golfclub e.V.
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'ogc-rastede-v1';

// Dateien, die beim Installieren gecacht werden (App Shell)
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Google Fonts (werden beim ersten Abruf gecacht)
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap'
];

// ── Install: App Shell cachen ──────────────────────────
self.addEventListener('install', event => {
  console.log('[OGC SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS.map(url => new Request(url, { mode: 'cors' })))
        .catch(err => console.warn('[OGC SW] Precache partial fail:', err));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: Alte Caches löschen ─────────────────────
self.addEventListener('activate', event => {
  console.log('[OGC SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[OGC SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-First für App Shell, Network-First für API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // WordPress REST API & externe Dienste → immer Network, Fallback Cache
  const networkFirst = [
    'oldenburgischer-golfclub.de/wp-json',
    'api.open-meteo.com',
    'nominatim.openstreetmap.org'
  ];

  const isNetworkFirst = networkFirst.some(pattern => url.href.includes(pattern));

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App Shell & statische Assets → Cache-First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Nur gültige Antworten cachen (kein opaque für Sicherheit)
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline-Fallback: index.html für Navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Push Notifications ─────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'OGC Rastede', body: event.data.text() }; }

  const options = {
    body: data.body || 'Neue Nachricht vom Oldenburgischer Golfclub',
    icon: './icon-192.png',
    badge: './icon-96.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || './index.html' },
    actions: [
      { action: 'open', title: 'Öffnen' },
      { action: 'close', title: 'Schließen' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'OGC Rastede', options)
  );
});

// ── Notification Click ─────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
