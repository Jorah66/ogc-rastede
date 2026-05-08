// ═══════════════════════════════════════════════════════════
//  OGC Rastede – Service Worker
//  Oldenburgischer Golfclub e.V.
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'ogc-rastede-v1';
const OFFLINE_URL = './index.html';

// Dateien, die beim Install sofort gecacht werden
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-72.png',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        // Einzelne Fehler (z.B. fehlende Icons) nicht abbrechend
        console.warn('[SW] Precache Fehler (wird ignoriert):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Alten Cache löschen:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // WordPress API: Network first, Cache fallback
  if (url.hostname === 'ogcrastede.de' || url.pathname.includes('/wp-json/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Google Fonts: Cache first (langlebig)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Alles andere: Cache first, Network fallback, Offline-Page als letzter Ausweg
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: Für Navigate-Requests die index.html zurückgeben
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
    })
  );
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'OGC Rastede', body: 'Neue Nachricht', icon: './icon-192.png' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icon-192.png',
      badge: './icon-72.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || './' },
      actions: [
        { action: 'open', title: 'Öffnen' },
        { action: 'close', title: 'Schließen' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const target = (event.notification.data && event.notification.data.url) || './';
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
