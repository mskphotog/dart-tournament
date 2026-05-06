/**
 * NETLIFY FUNCTION: save-subscription
 * ====================================
 * Receives a Web Push subscription object from the browser and saves it
 * to the push_subscriptions table in Supabase.
 *
 * Called by the client after the user grants notification permission.
 *
 * Method: POST
 * Body: { endpoint, keys: { p256dh, auth }, userAgent }
 *
 * Returns:
 *   200 - subscription saved or already exists
 *   400 - missing required fields
 *   500 - database error
 */

import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { endpoint, keys, userAgent } = body;

  // Validate required fields
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: endpoint, keys.p256dh, keys.auth' }),
    };
  }

  // Use service role key so this function can write to the table
  // (the anon key would be blocked by RLS on INSERT without auth)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Upsert: if the endpoint already exists, do nothing (ON CONFLICT DO NOTHING)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent || null,
      },
      { onConflict: 'endpoint', ignoreDuplicates: true }
    );

  if (error) {
    console.error('save-subscription DB error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to save subscription' }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};
