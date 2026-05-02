/**
 * TOURNAMENT HISTORY PAGE
 *
 * Public page showing every tournament in the database, grouped by month
 * with newest first. Each row links to the bracket for that tournament.
 *
 * This is reachable from the homepage's "View all tournaments" link and
 * directly via the /tournaments route. Designed to scale: even after a
 * full year of weekly tournaments (~52 entries), the month grouping keeps
 * the list scannable.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function TournamentHistoryPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllTournaments();
  }, []);

  async function loadAllTournaments() {
    setLoading(true);
    // Fetch every tournament with its game type and player count.
    // Ordered newest first so the most recent tournaments are at the top.
    const { data, error } = await supabase
      .from('tournaments')
      .select('*, game_type:game_types(name), tournament_players(count)')
      .order('tournament_date', { ascending: false });

    if (!error && data) {
      setTournaments(data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading"><div className="spinner"></div></div>
      </div>
    );
  }

  // Group tournaments by month-year. Each group key is a string like
  // "May 2026" and the value is the list of tournaments in that month.
  // We use a Map to preserve insertion order (which is newest first
  // because the source array is already sorted that way).
  const grouped = new Map();
  for (const t of tournaments) {
    const key = formatMonthYear(t.tournament_date);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  }

  return (
    <div className="container">
      <div className="history-header">
        <h1>Tournament History</h1>
        <p className="text-secondary">
          {tournaments.length === 0
            ? 'No tournaments yet.'
            : `${tournaments.length} tournament${tournaments.length === 1 ? '' : 's'} on record.`}
        </p>
      </div>

      {tournaments.length === 0 && (
        <div className="empty-state">
          <p>No tournaments yet. Check back after the first Wednesday night.</p>
          <Link to="/" className="btn btn-secondary mt-4">Back to home</Link>
        </div>
      )}

      {/* Render each month group */}
      {Array.from(grouped.entries()).map(([monthYear, monthTournaments]) => (
        <section key={monthYear} className="month-group">
          <h2 className="month-heading">{monthYear}</h2>
          <div className="tournament-list">
            {monthTournaments.map((t) => (
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
                      {formatDate(t.tournament_date)}
                      {t.game_type?.name && ` · ${t.game_type.name}`}
                      {' · '}
                      {t.tournament_players?.[0]?.count || 0} players
                    </p>
                  </div>
                  <span className={getStatusBadgeClass(t.status)}>
                    {formatStatus(t.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <style>{`
        .history-header {
          margin-bottom: var(--space-6);
        }
        .month-group {
          margin-bottom: var(--space-6);
        }
        .month-heading {
          font-size: 1.125rem;
          color: var(--color-text-secondary, #666);
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          margin-bottom: var(--space-3);
          padding-bottom: var(--space-2);
          border-bottom: 1px solid var(--color-border, #e0e0e0);
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

// Format ISO date string as "May 2026" for use as a month-group heading
function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    month: 'long',
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
