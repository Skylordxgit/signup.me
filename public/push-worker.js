self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "signup888";
  const options = {
    body: data.body || "You have a new update.",
    icon: data.icon || "/favicon.png",
    badge: data.badge || "/favicon-32x32.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/", self.location.origin);
  const url = destination.origin === self.location.origin ? destination.href : self.location.origin;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find(client => client.url === url);
    if (existing) return existing.focus();
    return clients.openWindow(url);
  }));
});
