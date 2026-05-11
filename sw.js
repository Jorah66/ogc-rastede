// ═══════════════════════════════════════════════════════════════
//  OGC Rastede – Service Worker
//  Strategie: Cache-First für App-Shell, Network-First für News
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME   = 'ogc-cache-v1';
const OFFLINE_URL  = './index.html';

// Dateien, die beim Install sofort gecacht werden (App-Shell)
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-72.png',
  './icon-192.png',
  './icon-180.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap'
];

// ── Install ────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Precache partial fail:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
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

// ── Fetch ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // WordPress REST API → Network-First (frische News)
  if (url.hostname.includes('oldenburgischer-golfclub.de') ||
      url.hostname.includes('wttr.in')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Google Fonts → Cache-First
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // App-Shell (index.html, icons, manifest) → Cache-First
  if (event.request.mode === 'navigate' ||
      PRECACHE_URLS.some(u => event.request.url.endsWith(u.replace('./', '')))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Alles andere → Network-First mit Cache-Fallback
  event.respondWith(networkFirst(event.request));
});

// ── Strategien ─────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(OFFLINE_URL);
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(OFFLINE_URL);
  }
}

// ── Push Notifications ─────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title   || 'OGC Rastede';
  const options = {
    body:    data.body    || 'Neue Nachricht vom Oldenburgischen Golfclub.',
    icon:    './icon-192.png',
    badge:   './icon-72.png',
    tag:     data.tag     || 'ogc-push',
    data:    data.url     || './',
    actions: data.actions || [],
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Background Sync (für spätere Nutzung) ─────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'ogc-sync') {
    console.log('[SW] Background sync triggered');
  }
});
