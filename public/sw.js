const CACHE_NAME = "schedule-parser-shell-v1";
const APP_SHELL = ["/", "/icon.svg", "/apple-touch-icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).catch(() => caches.match("/"));
    })
  );
});

// Web Push: displays the daily planning reminder (or any future push payload) as a system
// notification. Payloads only ever contain a type/title/body — never schedule content.
self.addEventListener("push", (event) => {
  let data = { title: "Schedule Parser", body: "Hey, did you plan your day already?", type: "daily-planning-reminder" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data = { ...data, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { type: data.type ?? "daily-planning-reminder" },
    })
  );
});

// Tapping the daily reminder opens Schedule Parser directly to the Import screen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const targetUrl = "/?tab=import";
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "notification-click", target: "import" });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
