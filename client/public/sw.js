// Kotiäly Service Worker for Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push notification
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Kotiäly Hälytys', body: event.data.text() };
    }
  }

  const title = data.title || 'Kotiäly Hälytys';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.data?.type ? `kotialy-${data.data.type}` : 'kotialy-notification',
    data: data.data || { url: '/' },
    vibrate: data.data?.severity === 'critical' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    requireInteraction: data.data?.severity === 'critical',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click -> open or focus dashboard
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url && client.url.includes(self.location.origin)) {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
