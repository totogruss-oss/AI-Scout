/*
 * Service Worker für AI Scout – bewusst klein gehalten.
 *
 * Zweck: Die App lässt sich installieren und ihre Oberfläche öffnet sich auch
 * bei schlechter Verbindung. Recherchen brauchen weiterhin Internet.
 *
 * Regeln:
 *  - Nur Dateien der App selbst werden gespeichert. Aufrufe an Google
 *    (Gemini, Drive) und andere Server gehen immer direkt ins Netz.
 *  - Die Startseite wird zuerst aus dem Netz geholt, damit Aktualisierungen
 *    sofort ankommen; der gespeicherte Stand dient nur als Rückfall.
 *  - Dateien unter assets/ tragen einen Prüfwert im Namen und ändern sich
 *    nie – sie kommen aus dem Speicher.
 */
const CACHE = 'ai-scout-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const store = async (request, response) => {
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => store(request, response))
        .catch(async () => (await caches.match(request)) || (await caches.match(self.registration.scope)) || Response.error())
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => store(request, response))));
    return;
  }

  // Übrige eigene Dateien (Icons, Manifest): Netz zuerst, Speicher als Rückfall.
  event.respondWith(fetch(request).then((response) => store(request, response)).catch(() => caches.match(request).then((hit) => hit || Response.error())));
});
