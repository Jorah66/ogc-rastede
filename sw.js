// ═══════════════════════════════════════════════════════════
// OGC Rastede – Service Worker
// Offline-Caching + Push Notifications
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'ogc-rastede-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Install: statische Dateien cachen ──────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: alte Caches löschen ─────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Cache-first für statische Assets,
//           Network-first für API/WordPress ─────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // WordPress REST API → immer netzwerk, fallback auf Cache
  if (url.hostname.includes('oldenburgischer-golfclub.de')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Erfolgreiche Antwort in Cache speichern
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Statische Assets → Cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// ── Push Notifications ─────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'OGC Rastede', body: 'Neue Nachricht', icon: './icon-192.png' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch(e) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || './icon-192.png',
      badge:   './icon-72.png',
      tag:     data.tag || 'ogc-notification',
      data:    { url: data.url || './' },
      actions: data.actions || [],
      vibrate: [200, 100, 200]
    })
  );
});

// ── Notification Click ─────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ── Background Sync (für spätere Erweiterung) ─────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-scores') {
    console.log('[SW] Background sync: scores');
  }
});
