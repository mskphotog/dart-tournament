/**
 * ADMIN DASHBOARD
 *
 * Main admin landing page. Shows all tournaments with status, lets admin
 * create a new weekly tournament, and provides quick links into individual
 * tournament management.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SendNotificationPanel from '../../components/SendNotificationPanel';

export default function AdminDashboardPage() {
  const [tournaments, setTournaments] = useState([]);
  const [gameTypes, setGameTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // New tournament form state
  const [tournamentDate, setTournamentDate] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [selectedGameTypeId, setSelectedGameTypeId] = useState('');
  const [gamesToWinOverride, setGamesToWinOverride] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadTournaments(), loadGameTypes()]);
    setLoading(false);
  }

  async function loadTournaments() {
    const { data } = await supabase
      .from('tournaments')
      .select('*, game_type:game_types(name), tournament_players(count)')
      .order('tournament_date', { ascending: false });
    setTournaments(data || []);
  }

  async function loadGameTypes() {
    const { data } = await supabase
      .from('game_types')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setGameTypes(data || []);
  }

  // Default the date input to next Wednesday
  useEffect(() => {
    if (showCreateForm && !tournamentDate) {
      setTournamentDate(getNextWednesday());
    }
  }, [showCreateForm, tournamentDate]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');

    if (!tournamentDate) {
      setError('Date is required');
      return;
    }

    setCreating(true);

    const payload = {
      tournament_date: tournamentDate,
      name: tournamentName || null,
      games_to_win_override: gamesToWinOverride ? Number(gamesToWinOverride) : null,
      status: 'setup',
    };

    const { data, error: createErr } = await supabase
      .from('tournaments')
      .insert(payload)
      .select()
      .single();

    setCreating(false);

    if (createErr) {
      setError(createErr.message);
      return;
    }

    // Reset form and reload
    setShowCreateForm(false);
    setTournamentDate('');
    setTournamentName('');
    setGamesToWinOverride('');
    await loadTournaments();
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading"><div className="spinner"></div></div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 style={{ marginBottom: 0 }}>Admin Dashboard</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : '+ New Tournament'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card mb-6">
          <h2>Create Weekly Tournament</h2>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input
                type="date"
                className="form-input"
                value={tournamentDate}
                onChange={(e) => setTournamentDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tournament Name (optional)</label>
              <input
                type="text"
                className="form-input"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="e.g., Holiday Special"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Games-to-Win Override (optional)</label>
              <input
                type="number"
                min="1"
                max="5"
                className="form-input"
                value={gamesToWinOverride}
                onChange={(e) => setGamesToWinOverride(e.target.value)}
                placeholder="Leave blank to use game type default"
              />
              <p className="text-secondary mt-1" style={{ fontSize: 'var(--font-size-sm)' }}>
                For example, "2" = best of 3, "3" = best of 5
              </p>
            </div>

            {error && <div className="form-error mb-4">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Tournament'}
            </button>
          </form>
        </div>
      )}

      {/* Push Notification Panel */}
      <SendNotificationPanel />

      {/* Tournament list */}
      <h2>All Tournaments</h2>
      {tournaments.length === 0 ? (
        <div className="empty-state">
          <p>No tournaments yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="tournament-grid">
          {tournaments.map((t) => (
            <Link
              key={t.id}
              to={`/admin/tournament/${t.id}`}
              className="card card-hover tournament-grid-item"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={getStatusBadgeClass(t.status)}>
                  {formatStatus(t.status)}
                </span>
                <span className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {formatDate(t.tournament_date)}
                </span>
              </div>
              <h3 className="mb-1">
                {t.name || `Tournament ${formatDate(t.tournament_date)}`}
              </h3>
              <p className="text-secondary">
                {t.game_type?.name} · {t.tournament_players?.[0]?.count || 0} players
              </p>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .tournament-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--space-4);
        }
        .tournament-grid-item {
          text-decoration: none;
          color: inherit;
        }
      `}</style>
    </div>
  );
}

// Helpers

function getNextWednesday() {
  const d = new Date();
  const daysUntilWed = (3 - d.getDay() + 7) % 7 || 7; // Next Wed (1-7 days away)
  d.setDate(d.getDate() + daysUntilWed);
  return d.toISOString().split('T')[0];
}

function formatDate(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatStatus(status) {
  return {
    setup: 'Setup',
    in_progress: 'Live',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[status] || status;
}

function getStatusBadgeClass(status) {
  const map = {
    setup: 'badge badge-warning',
    in_progress: 'badge badge-primary',
    completed: 'badge badge-success',
    cancelled: 'badge badge-neutral',
  };
  return map[status] || 'badge badge-neutral';
}
