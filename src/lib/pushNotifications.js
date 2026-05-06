/**
 * PUSH NOTIFICATIONS - client-side utilities
 * ============================================
 * Handles requesting notification permission, subscribing the device
 * to the Web Push service, and saving the subscription to the backend.
 *
 * HOW IT WORKS
 * ------------
 * 1. Browser asks user for notification permission
 * 2. If granted, the service worker subscribes to the browser's push service
 *    using our VAPID public key. This produces a subscription object with
 *    a unique endpoint URL and encryption keys.
 * 3. We POST that subscription to our Netlify function (save-subscription),
 *    which stores it in Supabase.
 * 4. When the admin sends a notification, the Netlify send-notification
 *    function reads all subscriptions and delivers the message via web-push.
 */


/**
 * Convert a base64 URL-safe string to a Uint8Array.
 * Required to pass the VAPID public key to the browser's push subscription API.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}


/**
 * Check if push notifications are supported in this browser.
 * Returns false on browsers that don't support service workers or push.
 */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}


/**
 * Get the current notification permission state.
 * Returns: 'default' | 'granted' | 'denied'
 */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}


/**
 * Subscribe this device to push notifications.
 *
 * Steps:
 *   1. Request notification permission from the user
 *   2. Get the active service worker registration
 *   3. Subscribe to push using the VAPID public key
 *   4. POST the subscription to the save-subscription Netlify function
 *
 * Returns:
 *   { success: true }  - subscribed and saved
 *   { success: false, reason: string } - failed with reason
 */
export async function subscribeToPush() {
  if (!isPushSupported()) {
    return { success: false, reason: 'Push notifications are not supported in this browser.' };
  }

  // Step 1: Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, reason: 'Notification permission was not granted.' };
  }

  // Step 2: Get the active service worker
  let registration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch (err) {
    return { success: false, reason: 'Service worker is not ready. Try again in a moment.' };
  }

  // Step 3: Subscribe to push
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.error('VITE_VAPID_PUBLIC_KEY is not set in environment variables.');
    return { success: false, reason: 'Push configuration error. Contact the administrator.' };
  }

  let subscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // required: all push messages must show a notification
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  } catch (err) {
    console.error('Push subscription error:', err);
    return { success: false, reason: 'Failed to subscribe to push notifications.' };
  }

  // Step 4: Save subscription to backend
  try {
    const response = await fetch('/.netlify/functions/save-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
        },
        userAgent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('save-subscription error:', err);
      return { success: false, reason: 'Subscribed locally but failed to save to server.' };
    }
  } catch (err) {
    console.error('save-subscription fetch error:', err);
    return { success: false, reason: 'Network error while saving subscription.' };
  }

  return { success: true };
}


/**
 * Check if this device is already subscribed to push notifications.
 * Returns true if there is an active push subscription in the service worker.
 */
export async function isAlreadySubscribed() {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    return !!existing;
  } catch {
    return false;
  }
}
