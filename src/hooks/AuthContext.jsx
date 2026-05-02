/**
 * AUTH CONTEXT
 *
 * Provides current user state and admin status to the entire app via React
 * Context. Listens to Supabase auth state changes so the UI updates
 * automatically when the admin logs in/out.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Current user object from Supabase, or null if not logged in
  const [user, setUser] = useState(null);
  // Whether we've finished checking the initial auth state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount: check if there's an existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Cleanup subscription on unmount
    return () => subscription.unsubscribe();
  }, []);

  // Check if the current user has admin role
  // The role is set on the user's app_metadata in Supabase dashboard
  const isAdmin = user?.app_metadata?.role === 'admin';

  // Sign in with email and password
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  // Sign out
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    isAdmin,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook for components to consume the auth context
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
