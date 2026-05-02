/**
 * APP - top-level routes
 *
 * Defines the URL routes and wraps everything in the layout.
 * Public routes are accessible without login; admin routes require auth.
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import StandingsPage from './pages/StandingsPage';
import TournamentBracketPage from './pages/TournamentBracketPage';
import PlayerProfilePage from './pages/PlayerProfilePage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminPlayersPage from './pages/admin/AdminPlayersPage';
import AdminGameTypesPage from './pages/admin/AdminGameTypesPage';
import AdminTournamentPage from './pages/admin/AdminTournamentPage';
import AdminPlacementPointsPage from './pages/admin/AdminPlacementPointsPage';
import AdminThemePage from './pages/admin/AdminThemePage';
import { useAuth } from './hooks/AuthContext';

// Wrapper that gates a route behind admin auth.
// If not logged in as admin, redirects to /login.
function RequireAdmin({ children }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/tournament/:tournamentId" element={<TournamentBracketPage />} />
        <Route path="/player/:playerId" element={<PlayerProfilePage />} />

        {/* Admin routes (auth-gated) */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/players"
          element={
            <RequireAdmin>
              <AdminPlayersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/game-types"
          element={
            <RequireAdmin>
              <AdminGameTypesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/placement-points"
          element={
            <RequireAdmin>
              <AdminPlacementPointsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/theme"
          element={
            <RequireAdmin>
              <AdminThemePage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/tournament/:tournamentId"
          element={
            <RequireAdmin>
              <AdminTournamentPage />
            </RequireAdmin>
          }
        />

        {/* Catch-all: redirect unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
