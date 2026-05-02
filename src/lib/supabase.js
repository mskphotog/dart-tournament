/**
 * SUPABASE CLIENT
 *
 * Single shared client instance used throughout the app to talk to Supabase.
 * Reads credentials from Vite environment variables (VITE_ prefixed vars get
 * exposed to the browser at build time).
 *
 * The "anon" key is safe to expose in the frontend because Row Level Security
 * (RLS) policies on the database control what each user can actually do.
 */

import { createClient } from '@supabase/supabase-js';

// Pull credentials from environment. These are set in .env locally
// and in Netlify dashboard for production.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sanity check during development so we get a clear error
// rather than confusing network failures
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase credentials. Copy .env.example to .env and fill in your project values.'
  );
}

// Create the shared client. The auth options persist the session
// in localStorage so admins stay logged in across page refreshes.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
