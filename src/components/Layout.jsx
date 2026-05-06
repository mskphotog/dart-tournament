/**
 * LAYOUT
 *
 * Wraps the entire app with a header containing navigation. Mobile-first,
 * collapses to a hamburger-style menu on narrow viewports. Admin links are
 * only shown when the current user is logged in as admin.
 */

import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/AuthContext';
import NotificationPrompt from './NotificationPrompt';
import './Layout.css';

export default function Layout({ children }) {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu when route changes
  const handleNavClick = () => setMenuOpen(false);

  // Helper to mark active link
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Helper to detect when we're on the admin DASHBOARD specifically (not any
  // other /admin/* route). Used for the "Admin" link's active highlight.
  const isAdminDashboard = () => {
    return (
      location.pathname === '/admin' ||
      (location.pathname.startsWith('/admin/tournament') && !location.pathname.includes('theme'))
    );
  };

  return (
    <div className="app-layout">
      {/* Top navigation bar */}
      <header className="app-header">
        <div className="container header-inner">
          {/* Logo / brand */}
          <Link to="/" className="brand" onClick={handleNavClick}>
            <span className="brand-icon">🎯</span>
            <span className="brand-name">Dart Tournament</span>
          </Link>

          {/* Hamburger toggle (mobile only) */}
          <button
            className="menu-toggle"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="hamburger-bar"></span>
            <span className="hamburger-bar"></span>
            <span className="hamburger-bar"></span>
          </button>

          {/* Navigation links */}
          <nav className={`app-nav ${menuOpen ? 'open' : ''}`}>
            <Link
              to="/"
              className={`nav-link ${isActive('/') ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              Home
            </Link>
            <Link
              to="/standings"
              className={`nav-link ${isActive('/standings') ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              Standings
            </Link>

            {/* Admin-only links */}
            {isAdmin && (
              <>
                <Link
                  to="/admin"
                  className={`nav-link ${isAdminDashboard() ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  Admin
                </Link>
                <Link
                  to="/admin/players"
                  className={`nav-link ${isActive('/admin/players') ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  Players
                </Link>
                <Link
                  to="/admin/game-types"
                  className={`nav-link ${isActive('/admin/game-types') ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  Game Types
                </Link>
                <Link
                  to="/admin/placement-points"
                  className={`nav-link ${isActive('/admin/placement-points') ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  Placement Points
                </Link>
                <Link
                  to="/admin/theme"
                  className={`nav-link ${isActive('/admin/theme') ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  Theme
                </Link>
              </>
            )}

            {/* Auth controls */}
            {user ? (
              <button
                className="nav-link nav-button"
                onClick={() => {
                  handleNavClick();
                  signOut();
                }}
              >
                Sign Out
              </button>
            ) : (
              <Link
                to="/login"
                className={`nav-link ${isActive('/login') ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                Admin Login
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        {children}
      </main>

      {/* Push notification permission prompt (non-admin pages only) */}
      <NotificationPrompt />

      {/* Footer */}
      <footer className="app-footer">
        <div className="container">
          <p className="text-secondary text-center">
            Wednesday Night Dart Tournament
          </p>
        </div>
      </footer>
    </div>
  );
}
