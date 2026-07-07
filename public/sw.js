// S&H Services Job Tracker — Service Worker
// Caches the app shell so the app opens instantly and works briefly offline.
// Live data (jobs, leads, etc.) always comes from Supabase over the network —
// this only caches the static app files, not your data.

const CACHE_NAME = "sh-jobs-shell-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept API calls to Supabase — always go to the network for live data
  if (request.url.includes("supabase.co")) return;

  // Network-first for navigation/app files, falling back to cache if offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest)
  if (request.url.includes("/icons/") || request.url.includes("manifest.json")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});

// ─── Push Notifications ───────────────────────────────────────────────────
// Shows an OS-level notification for new task assignments and purchase
// approvals — fires whether or not the app is open, so crews in the field
// see it even with the app closed.
self.addEventListener("push", (event) => {
  let data = { title: "S&H Job Tracker", body: "You have a new update.", url: "/", tag: "sh-notify" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url },
      vibrate: [100, 50, 100],
    })
  );
});

// Clicking the notification focuses an already-open tab if there is one,
// otherwise opens a new one at the relevant URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
