[README.md](https://github.com/user-attachments/files/27586571/README.md)
# OGC Rastede – PWA Deployment

## Dateiübersicht

```
/
├── index.html        ← App (Haupt-HTML, alle Assets inline)
├── manifest.json     ← PWA-Manifest (Name, Icons, Farben)
├── sw.js             ← Service Worker (Caching, Offline, Push)
├── icon-72.png       ← App-Icon klein (PWA Install Banner)
├── icon-180.png      ← App-Icon Apple Touch Icon
├── icon-192.png      ← App-Icon Android / Maskable
└── icon-512.png      ← App-Icon Splash Screen / Play Store
```

## Deployment (Webserver)

Alle Dateien in dasselbe Verzeichnis auf einem HTTPS-Server hochladen.
PWA funktioniert **nur über HTTPS** (außer localhost).

### Empfohlene Optionen

| Option | Beschreibung |
|--------|-------------|
| **GitHub Pages** | Kostenlos, HTTPS automatisch, einfach |
| **Netlify** | Kostenlos, Drag & Drop Deploy |
| **Eigener Server** | nginx/Apache mit HTTPS (Let's Encrypt) |

### nginx Konfiguration (Ausschnitt)

```nginx
location /ogc-app/ {
    root /var/www/html;
    index index.html;
    
    # Service Worker darf nicht gecacht werden
    location ~* sw\.js$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    
    # Manifest ebenfalls fresh halten
    location ~* manifest\.json$ {
        add_header Cache-Control "no-cache";
    }
}
```

## Push Notifications aktivieren

1. VAPID-Schlüsselpaar generieren:
   ```bash
   npx web-push generate-vapid-keys
   ```

2. Public Key in `index.html` eintragen (Suche nach `BEl62iUY...`):
   ```javascript
   applicationServerKey: urlBase64ToUint8Array('DEIN_PUBLIC_KEY_HIER')
   ```

3. Private Key auf dem Server für Push-Versand verwenden.

## Nächste Schritte Richtung React Native / Supabase

- [ ] Turnierdaten in Supabase-Tabelle `tournaments` migrieren
- [ ] News weiterhin über WordPress REST API (live ✅)
- [ ] Platzbelegung über Google Calendar API oder eigenes Backend
- [ ] Mitglieder-Login über Supabase Auth
- [ ] Push-Notifications über Supabase Edge Functions

## Technische Details

- **Caching-Strategie**: Cache-First für App-Shell, Network-First für API-Calls
- **Offline**: App vollständig offline nutzbar (außer News & Wetter)
- **iOS**: Install-Hinweis über Safari „Zum Home-Bildschirm" erscheint nach 3s
- **Android/Desktop**: Nativer Install-Dialog nach 3s

---
*OGC Rastede App Prototyp v5.11 – Stand Mai 2026*
