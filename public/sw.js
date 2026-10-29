// Service worker de Notiono: instalabilidad + shell offline + avisos push.
// - Mutaciones (no-GET) y /api/*: siempre a la red, sin tocar caché.
// - Estáticos inmutables (/_next/static, iconos, fuentes): cache-first.
// - Navegaciones: network-first con fallback a lo último cacheado (shell offline).
const VERSION = "v1";
const SHELL = `notiono-shell-${VERSION}`;
const STATIC = `notiono-static-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/login"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // mutaciones: red directa
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // datos: nunca desde caché
  // El APK se descarga, no se navega: si lo tocara el service worker acabaría un
  // megabyte en la caché del shell y, sin red, devolviendo el HTML de «/» con
  // nombre de .apk.
  if (url.pathname === "/notiono.apk") return;

  // Estáticos con hash o inmutables: cache-first
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navegaciones: network-first, fallback al shell cacheado si no hay red
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});


// --- Avisos push ---
// El servidor manda { title, body, url } y, si es un recordatorio, `recordatorio` (sus
// botones «Hecho» y «Posponer 1 h»). Si el JSON viniera mal, se avisa igual.
self.addEventListener("push", (e) => {
  let data = { title: "Notiono", body: "Tienes algo nuevo", url: "/" };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {
    // payload no-JSON: se queda el aviso genérico
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/", recordatorio: data.recordatorio || null },
      tag: data.url || "notiono",
      actions: data.recordatorio
        ? [
            { action: "hecho", title: "Hecho" },
            { action: "posponer", title: "Posponer 1 h" },
          ]
        : [],
    }),
  );
});

// Al pulsar el aviso: reutiliza la pestaña abierta si la hay, en vez de abrir otra.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const rec = e.notification.data && e.notification.data.recordatorio;
  // Un botón de recordatorio: se hace sin abrir nada (con la cookie de la sesión).
  if (rec && (e.action === "hecho" || e.action === "posponer")) {
    e.waitUntil(
      fetch("/api/recordatorio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: e.action, ...rec }),
      }).catch(() => {}),
    );
    return;
  }
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
