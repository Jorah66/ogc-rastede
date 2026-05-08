// ════════════════════════════════════════════════════════════════
//  OGC Rastede – Service Worker v1.2
//  Oldenburgischer Golfclub e.V.
//  Strategie: Cache-First für Assets, Network-First für API/News
// ════════════════════════════════════════════════════════════════

const CACHE_NAME      = 'ogc-app-v1.2';
const CACHE_STATIC    = 'ogc-static-v1.2';
const CACHE_DYNAMIC   = 'ogc-dynamic-v1.2';

// ── Dateien, die beim Install sofort gecacht werden ──────────────
const STATIC_ASSETS = [
  './',
  './ogc-app-prototyp-v5_12.html',
  './manifest.json',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-192.png',
  './icon-384.png',
  './icon-512.png',
  // Google Fonts werden dynamisch gecacht (siehe DYNAMIC_DOMAINS)
];

// ── Domains/Pfade, die dynamisch gecacht werden ──────────────────
const DYNAMIC_CACHE_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /oldenburgischer-golfclub\.de\/wp-content\/uploads/,  // Bilder von der Website
];

// ── API-Calls: immer Network-First (nie cachen) ──────────────────
const NETWORK_ONLY_PATTERNS = [
  /oldenburgischer-golfclub\.de\/wp-json/,   // WordPress News API
  /calendar\.google\.com/,
  /albatros9\.net/,
];

// ────────────────────────────────────────────────────────────────
//  INSTALL – Static Assets in Cache laden
// ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[OGC SW] Install – Cache wird befüllt');
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        // ignoreSearch: URL-Parameter ignorieren
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[OGC SW] Einige Assets konnten nicht gecacht werden:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ────────────────────────────────────────────────────────────────
//  ACTIVATE – Alte Caches aufräumen
// ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[OGC SW] Aktiviert – Alte Caches werden bereinigt');
  const allowedCaches = [CACHE_STATIC, CACHE_DYNAMIC];
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => !allowedCaches.includes(name))
            .map(name => {
              console.log('[OGC SW] Lösche alten Cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ────────────────────────────────────────────────────────────────
//  FETCH – Anfragen abfangen
// ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Chrome-Extensions und Non-HTTP ignorieren
  if (!url.startsWith('http')) return;

  // Network-Only: API-Calls immer frisch vom Server
  if (NETWORK_ONLY_PATTERNS.some(p => p.test(url))) {
    event.respondWith(fetchWithFallback(event.request));
    return;
  }

  // Dynamisch zu cachende Ressourcen (Bilder, Fonts)
  if (DYNAMIC_CACHE_PATTERNS.some(p => p.test(url))) {
    event.respondWith(cacheFirst(event.request, CACHE_DYNAMIC));
    return;
  }

  // Statische Assets: Cache-First
  event.respondWith(cacheFirst(event.request, CACHE_STATIC));
});

// ────────────────────────────────────────────────────────────────
//  PUSH – Benachrichtigungen empfangen
// ────────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: 'OGC Rastede',
      body: event.data.text(),
      icon: './icon-192.png',
    };
  }

  const options = {
    body:    payload.body   || 'Neue Mitteilung vom OGC',
    icon:    payload.icon   || './icon-192.png',
    badge:   payload.badge  || './icon-72.png',
    image:   payload.image  || undefined,
    tag:     payload.tag    || 'ogc-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || './',
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: 'open',    title: 'Öffnen' },
      { action: 'dismiss', title: 'Schließen' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'OGC Rastede', options)
  );
});

// ────────────────────────────────────────────────────────────────
//  NOTIFICATION CLICK
// ────────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Bereits offenes Fenster fokussieren
        for (const client of clientList) {
          if (client.url.includes('ogc') && 'focus' in client) {
            return client.focus();
          }
        }
        // Neues Fenster öffnen
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ────────────────────────────────────────────────────────────────
//  BACKGROUND SYNC (für spätere Offline-Formular-Unterstützung)
// ────────────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'ogc-sync') {
    console.log('[OGC SW] Background Sync ausgelöst');
    // Hier könnten offline gespeicherte Daten synchronisiert werden
  }
});

// ────────────────────────────────────────────────────────────────
//  HILFSFUNKTIONEN
// ────────────────────────────────────────────────────────────────

/**
 * Cache-First Strategie:
 * 1. Aus Cache laden (schnell, offline-fähig)
 * 2. Falls nicht im Cache → Netzwerk → in Cache speichern
 */
async function cacheFirst(request, cacheName) {
  try {
    const cache    = await caches.open(cacheName);
    const cached   = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      // Nur erfolgreiche Antworten cachen
      const responseClone = response.clone();
      cache.put(request, responseClone);
    }
    return response;
  } catch (err) {
    // Offline-Fallback: App-Shell aus Cache
    const cache    = await caches.open(CACHE_STATIC);
    const fallback = await cache.match('./ogc-app-prototyp-v5_12.html');
    return fallback || new Response('Offline – OGC App nicht verfügbar', {
      status: 503,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
  }
}

/**
 * Network-First mit Offline-Fallback:
 * 1. Netzwerk versuchen
 * 2. Bei Fehler: leere JSON-Antwort für API-Calls
 */
async function fetchWithFallback(request) {
  try {
    return await fetch(request);
  } catch (err) {
    console.warn('[OGC SW] Netzwerkfehler, Offline-Fallback:', request.url);
    // Für API-Calls: leeres JSON zurückgeben
    if (request.headers.get('accept')?.includes('json')) {
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('', { status: 503 });
  }
}
