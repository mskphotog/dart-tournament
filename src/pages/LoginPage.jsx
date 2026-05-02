/**
 * LOGIN PAGE
 *
 * Admin login form. Public users don't need to log in for any standard feature,
 * so this page is purely for admin access. Uses Supabase Auth signInWithPassword.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';

export default function LoginPage() {
  const { signIn, user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // If already logged in as admin, redirect to admin dashboard
  if (user && isAdmin) {
    navigate('/admin', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { data, error: signInError } = await signIn(email, password);

    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // Verify admin role
    const role = data?.user?.app_metadata?.role;
    if (role !== 'admin') {
      setError('This account does not have admin access.');
      return;
    }

    navigate('/admin', { replace: true });
  }

  return (
    <div className="container container-narrow">
      <div className="card">
        <h1 className="text-center mb-4">Admin Login</h1>
        <p className="text-secondary text-center mb-6">
          Enter your admin credentials to manage tournaments.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div className="form-error mb-4">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
