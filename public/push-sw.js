/* Push handlers imported by the generated service worker (sw.js). Payloads come from FCM. */
self.addEventListener("push", function (event) {
  var raw = {};
  try { raw = event.data ? event.data.json() : {}; } catch (e) { raw = { title: "Escala+", body: event.data ? event.data.text() : "" }; }
  var d = raw.data || raw.notification || raw;
  var title = d.title || "Escala+";
  var options = {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: d.tag || undefined,
    data: { url: d.url || "/notificacoes" },
    lang: "pt-BR",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/notificacoes";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
