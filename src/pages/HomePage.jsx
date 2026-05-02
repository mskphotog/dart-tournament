/**
 * HOME PAGE
 *
 * Public landing page. Shows the most recent / current tournament with
 * quick links to the live bracket and standings. If there's no tournament
 * yet, shows a placeholder with a prompt to log in as admin.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function HomePage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTournaments();
  }, []);

  async function loadTournaments() {
    setLoading(true);
    // Get the 5 most recent tournaments, plus the active in_progress one if any
    const { data, error } = await supabase
      .from('tournaments')
      .select('*, game_type:game_types(name), tournament_players(count)')
      .order('tournament_date', { ascending: false })
      .limit(5);

    if (!error && data) {
      setTournaments(data);
    }
    setLoading(false);
  }

  // Find the currently in-progress tournament (if any)
  const liveTournament = tournaments.find((t) => t.status === 'in_progress');
  const recentTournaments = tournaments.filter((t) => t.id !== liveTournament?.id);

  if (loading) {
    return (
      <div className="container">
        <div className="loading"><div className="spinner"></div></div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Wednesday Night Dart Tournament</h1>

      {/* Live tournament banner */}
      {liveTournament && (
        <div className="card mb-6" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div className="flex items-center gap-3 mb-2">
            <span className="badge badge-primary">Live Now</span>
            <span className="text-secondary">
              {formatDate(liveTournament.tournament_date)}
            </span>
          </div>
          <h2 className="mb-2">
            {liveTournament.name || `Tournament - ${formatDate(liveTournament.tournament_date)}`}
          </h2>
          <p className="text-secondary mb-4">
            Game: {liveTournament.game_type?.name || 'TBD'} ·{' '}
            {liveTournament.tournament_players?.[0]?.count || 0} players
          </p>
          <Link to={`/tournament/${liveTournament.id}`} className="btn btn-primary">
            View Live Bracket
          </Link>
        </div>
      )}

      {/* Quick links */}
      <div className="grid-2 mb-6">
        <Link to="/standings" className="card card-hover">
          <h3>Season Standings</h3>
          <p className="text-secondary">View total points and rankings for the season.</p>
        </Link>
        {!liveTournament && (
          <div className="card">
            <h3 className="text-secondary">No Tournament In Progress</h3>
            <p className="text-secondary">Tournaments run most Wednesdays at 8 PM.</p>
          </div>
        )}
      </div>

      {/* Recent tournaments */}
      {recentTournaments.length > 0 && (
        <>
          <h2>Recent Tournaments</h2>
          <div className="tournament-list">
            {recentTournaments.map((t) => (
              <Link
                key={t.id}
                to={`/tournament/${t.id}`}
                className="card card-hover tournament-list-item"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="mb-1">
                      {t.name || formatDate(t.tournament_date)}
                    </h3>
                    <p className="text-secondary">
                      {t.game_type?.name} · {t.tournament_players?.[0]?.count || 0} players
                    </p>
                  </div>
                  <span className={getStatusBadgeClass(t.status)}>
                    {formatStatus(t.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {tournaments.length === 0 && (
        <div className="empty-state">
          <p>No tournaments yet. Sign in as admin to create the first one.</p>
        </div>
      )}

      <style>{`
        .grid-2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--space-4);
        }
        .tournament-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .tournament-list-item {
          text-decoration: none;
          color: inherit;
        }
      `}</style>
    </div>
  );
}

// Format ISO date string as "Wed, Jan 15, 2026"
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatStatus(status) {
  const map = {
    setup: 'Setup',
    in_progress: 'Live',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[status] || status;
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
