/**
 * CUSTOM SERVICE WORKER — Push Notification Handler
 * ===================================================
 * This file is injected into the Workbox-generated service worker via
 * vite-plugin-pwa's `importScripts` option. It adds push event handling
 * on top of the auto-generated caching service worker.
 *
 * HOW PUSH WORKS
 * --------------
 * 1. Admin sends a notification via the Netlify send-notification function
 * 2. Google's FCM (Firebase Cloud Messaging) delivers it to this service worker
 * 3. The 'push' event fires here with the notification payload
 * 4. We call self.registration.showNotification() to display it on the device
 * 5. If the user taps the notification, the 'notificationclick' event fires
 *    and we open/focus the app
 */

// Listen for incoming push messages from the server
self.addEventListener('push', function (event) {
  // Guard: if no data was sent, show a generic notification
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('Darts @ LIT', {
        body: 'You have a new update.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
      })
    );
    return;
  }

  // Parse the JSON payload sent by the send-notification function
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    // Fallback if payload is plain text
    payload = { title: 'Darts @ LIT', body: event.data.text(), url: '/' };
  }

  const title = payload.title || 'Darts @ LIT';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'lit-darts-notification',       // replaces previous notification instead of stacking
    renotify: true,                       // vibrate/sound even if replacing same tag
    requireInteraction: false,            // auto-dismiss after a few seconds
    data: { url: payload.url || '/' },   // passed to notificationclick handler
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});


// Handle notification tap — open or focus the app
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // If the app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
