/**
 * HOME PAGE
 *
 * Public landing page. Shows the most recent / current tournament with
 * quick links to the live bracket and standings. If there's no tournament
 * yet, shows a placeholder with a prompt to log in as admin.
 *
 * The recent tournaments list is capped at 6 entries. If there are more
 * than 6 tournaments in the database, a "View all" link appears below the
 * list pointing to /tournaments for the full history.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// How many tournaments to show in the homepage list before linking out to
// the full history page. Tweak here if you ever want a different cap.
const HOMEPAGE_RECENT_CAP = 6;

export default function HomePage() {
  const [tournaments, setTournaments] = useState([]);
  // Total count of all tournaments in the DB, used to decide whether to
  // show the "View all" link. We fetch this separately because the main
  // tournaments query is capped.
  const [totalTournamentCount, setTotalTournamentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTournaments();
  }, []);

  async function loadTournaments() {
    setLoading(true);

    // Fetch the most recent tournaments, capped at HOMEPAGE_RECENT_CAP.
    // We fetch one extra (cap + 1) when there's a live tournament so that
    // after we filter the live one out, we still have a full list of
    // recent completed tournaments to display. This avoids the case where
    // a live tournament eats one of the visible "recent" slots.
    const fetchLimit = HOMEPAGE_RECENT_CAP + 1;

    const { data, error } = await supabase
      .from('tournaments')
      .select('*, game_type:game_types(name), tournament_players(count)')
      .order('tournament_date', { ascending: false })
      .limit(fetchLimit);

    if (!error && data) {
      setTournaments(data);
    }

    // Separately, get the total count so we know whether to show "View all".
    // The head: true option means we get just the count without the rows,
    // which is fast and cheap.
    const { count } = await supabase
      .from('tournaments')
      .select('*', { count: 'exact', head: true });

    if (count !== null) {
      setTotalTournamentCount(count);
    }

    setLoading(false);
  }

  // Find the currently in-progress tournament (if any) and split it out
  // so it shows in its own banner above the recent list.
  const liveTournament = tournaments.find((t) => t.status === 'in_progress');
  // Filter the live tournament out of the recent list, then trim down to
  // the cap so we never show more than HOMEPAGE_RECENT_CAP rows.
  const recentTournaments = tournaments
    .filter((t) => t.id !== liveTournament?.id)
    .slice(0, HOMEPAGE_RECENT_CAP);

  // Show the "View all" link only if there are more tournaments in the
  // database than we're displaying on this page. If a live tournament is
  // shown in its own banner, it counts against the displayed total.
  const displayedCount = recentTournaments.length + (liveTournament ? 1 : 0);
  const hasMoreToShow = totalTournamentCount > displayedCount;

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

          {/* View all link, only shown when there's more history beyond what's displayed */}
          {hasMoreToShow && (
            <div className="view-all-row">
              <Link to="/tournaments" className="view-all-link">
                View all tournaments &rarr;
              </Link>
            </div>
          )}
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
        .view-all-row {
          margin-top: var(--space-4);
          text-align: center;
        }
        .view-all-link {
          display: inline-block;
          padding: var(--space-2) var(--space-4);
          color: var(--color-primary);
          text-decoration: none;
          font-weight: 500;
          border-radius: var(--radius-md, 8px);
          transition: background-color 0.15s ease;
        }
        .view-all-link:hover {
          background-color: var(--color-bg-hover, rgba(0, 0, 0, 0.04));
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
