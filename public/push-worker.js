self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(clients.claim()); });

function trackCampaign(campaignId, event) {
  if (!campaignId) return Promise.resolve();
  return fetch('/api/notifications/campaign-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ campaignId, event }),
    keepalive: true,
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "signup888";
  const campaignId = typeof data.campaignId === 'number' ? data.campaignId : null;
  const options = {
    body: data.body || "You have a new update.",
    icon: data.icon || "/favicon.png",
    badge: data.badge || "/favicon-32x32.png",
    data: { url: data.url || "/", campaignId },
  };

  event.waitUntil(trackCampaign(campaignId, 'delivered').then(() => self.registration.showNotification(title, options)).then(() => trackCampaign(campaignId, 'seen')));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = self.location.origin + '/';
  try {
    const raw = event.notification.data?.url;
    const value = typeof raw === 'string' ? raw.trim() : '';
    const localPath = value.startsWith('/') && !value.startsWith('//');
    if (value && !/[\u0000-\u0020\u007f\\]/.test(value) && (localPath || /^https:\/\//i.test(value))) {
      const destination = new URL(value, self.location.origin);
      if (!destination.username && !destination.password) url = destination.href;
    }
  } catch { /* Older or malformed notifications open the homepage. */ }
  const campaignId = event.notification.data?.campaignId;
  event.waitUntil(trackCampaign(campaignId, 'clicked').then(() => clients.matchAll({ type: "window", includeUncontrolled: true })).then(async (windows) => {
    const existing = windows.find(client => client.url === url);
    if (existing) return existing.focus();
    return clients.openWindow(url);
  }));
});
