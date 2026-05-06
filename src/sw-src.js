/**
 * CUSTOM SERVICE WORKER SOURCE
 * ============================
 * This file is the source for the generated service worker.
 * vite-plugin-pwa (injectManifest strategy) will:
 *   1. Inject the precache manifest into self.__WB_MANIFEST
 *   2. Output the final sw.js to dist/
 *
 * WHY THIS APPROACH (instead of importScripts):
 * Using importScripts('/sw-push.js') caused a blocking network fetch every
 * time the service worker restarted (browser kills idle SWs after ~30s).
 * That fetch had to revalidate sw-push.js from Netlify on every SW startup,
 * causing 16-second page load delays. By inlining the push handler code here,
 * the entire SW is a single self-contained file with zero external dependencies.
 */

import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Take control of all clients immediately when a new SW activates.
// Combined with skipWaiting below, this ensures updates apply right away.
self.skipWaiting();
clientsClaim();

// Inject the Workbox precache manifest (replaced at build time by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// Remove outdated precaches from previous SW versions
cleanupOutdatedCaches();

// SPA navigation: serve index.html for all navigation requests
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'))
);

// Runtime cache: Supabase REST API (NetworkFirst with 5s timeout)
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/rest/'),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
    ],
  }),
  'GET'
);

// Runtime cache: Google Fonts (CacheFirst, long-lived)
registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  }),
  'GET'
);

// ---------------------------------------------------------------------------
// PUSH NOTIFICATION HANDLER (inlined — no importScripts needed)
// ---------------------------------------------------------------------------

// Listen for incoming push messages from the server
self.addEventListener('push', function (event) {
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

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Darts @ LIT', body: event.data.text(), url: '/' };
  }

  const title = payload.title || 'Darts @ LIT';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'lit-darts-notification',
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification tap — open or focus the app
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if (
            client.url.includes(self.location.origin) &&
            'focus' in client
          ) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
