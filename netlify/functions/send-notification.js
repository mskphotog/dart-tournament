/**
 * NETLIFY FUNCTION: send-notification
 * =====================================
 * Sends a push notification to all subscribed devices.
 * Called by the admin UI when they want to broadcast a message
 * (e.g., "Match 4 is ready - John vs. Mike").
 *
 * This function is admin-only. It verifies the caller is an authenticated
 * Supabase admin before sending anything.
 *
 * Method: POST
 * Headers: Authorization: Bearer <supabase_access_token>
 * Body: { title, body, url }
 *   title - notification title (e.g., "Darts @ LIT")
 *   body  - notification message (e.g., "Match 4 is ready - John vs. Mike")
 *   url   - optional URL to open when notification is tapped (defaults to "/")
 *
 * Returns:
 *   200 - { sent: N, failed: N }
 *   401 - not authenticated or not admin
 *   400 - missing required fields
 *   500 - unexpected error
 */

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configure web-push with VAPID keys from environment variables
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // -----------------------------------------------------------------------
  // Step 1: Verify the caller is an authenticated admin
  // -----------------------------------------------------------------------
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing authorization header' }) };
  }

  const accessToken = authHeader.replace('Bearer ', '');

  // Use the anon client to verify the token (getUser validates the JWT)
  const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);

  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
  }

  // Check admin role from app_metadata
  const isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Admin access required' }) };
  }

  // -----------------------------------------------------------------------
  // Step 2: Parse and validate the notification payload
  // -----------------------------------------------------------------------
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { title, body: message, url } = body;

  if (!title || !message) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: title, body' }),
    };
  }

  // -----------------------------------------------------------------------
  // Step 3: Load all subscriptions from Supabase
  // -----------------------------------------------------------------------
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: subscriptions, error: fetchError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (fetchError) {
    console.error('send-notification fetch error:', fetchError);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to load subscriptions' }) };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ sent: 0, failed: 0, message: 'No subscriptions found' }),
    };
  }

  // -----------------------------------------------------------------------
  // Step 4: Send the notification to every subscribed device
  // -----------------------------------------------------------------------
  const payload = JSON.stringify({
    title,
    body: message,
    url: url || '/',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
  });

  let sent = 0;
  let failed = 0;
  const expiredEndpoints = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        sent++;
      } catch (err) {
        failed++;
        // HTTP 410 Gone means the subscription is no longer valid (user uninstalled
        // the app or revoked permission). Remove it from the database.
        if (err.statusCode === 410) {
          expiredEndpoints.push(sub.id);
        } else {
          console.error(`Push failed for endpoint ${sub.endpoint}:`, err.message);
        }
      }
    })
  );

  // -----------------------------------------------------------------------
  // Step 5: Clean up expired subscriptions
  // -----------------------------------------------------------------------
  if (expiredEndpoints.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('id', expiredEndpoints);
    console.log(`Removed ${expiredEndpoints.length} expired subscription(s)`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ sent, failed }),
  };
};
