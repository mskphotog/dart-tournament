-- Migration 005: Push notification subscriptions table
--
-- Stores Web Push API subscription objects for each device that has
-- granted notification permission. Each row represents one browser/device
-- installation. A single user may have multiple rows if they use multiple
-- devices or browsers.
--
-- The subscription object from the browser contains:
--   endpoint  - the push service URL (unique per device/browser)
--   keys.p256dh - public key for message encryption
--   keys.auth   - auth secret for message encryption
--
-- RLS: anyone can insert their own subscription (no auth required, since
-- non-logged-in players need to subscribe too). Only admins can read the
-- full list or delete subscriptions.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index on endpoint for fast upsert lookups
CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON push_subscriptions (endpoint);

-- Enable Row Level Security
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can insert a subscription.
-- The endpoint is unique so duplicate inserts are handled via ON CONFLICT.
CREATE POLICY "Anyone can subscribe"
  ON push_subscriptions
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Only admins can read the subscription list (needed by the push server function)
CREATE POLICY "Admins can read subscriptions"
  ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Only admins can delete subscriptions (cleanup of expired endpoints)
CREATE POLICY "Admins can delete subscriptions"
  ON push_subscriptions
  FOR DELETE
  TO authenticated
  USING (is_admin());
