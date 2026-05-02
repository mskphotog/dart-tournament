/**
 * STANDINGS PAGE
 *
 * Public page showing the season-long leaderboard. Pulls from the
 * season_standings view which aggregates total points per player.
 * No login required.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function StandingsPage() {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStandings();
  }, []);

  async function loadStandings() {
    setLoading(true);
    // Query the season_standings view created in our migrations
    const { data, error } = await supabase
      .from('season_standings')
      .select('*');

    if (!error && data) {
      setStandings(data);
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

  // Filter out players with zero participation so the leaderboard shows
  // active competitors only
  const activeStandings = standings.filter((s) => s.tournaments_played > 0);

  return (
    <div className="container">
      <h1>Season Standings</h1>
      <p className="text-secondary mb-6">
        Total points = match wins + tournament placement bonuses.
      </p>

      {activeStandings.length === 0 ? (
        <div className="empty-state">
          <p>No completed tournaments yet. Standings will appear here once the season starts.</p>
        </div>
      ) : (
        <div className="standings-table card">
          <div className="standings-row standings-header">
            <div className="rank">Rank</div>
            <div className="player">Player</div>
            <div className="stat">Tourneys</div>
            <div className="stat">Wins</div>
            <div className="stat">Points</div>
          </div>
          {activeStandings.map((s, index) => (
            <Link
              key={s.player_id}
              to={`/player/${s.player_id}`}
              className="standings-row"
            >
              <div className="rank">
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
              </div>
              <div className="player">{s.player_name}</div>
              <div className="stat">{s.tournaments_played}</div>
              <div className="stat">{s.tournaments_won}</div>
              <div className="stat points">{s.total_points}</div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .standings-table {
          padding: 0;
          overflow: hidden;
        }
        .standings-row {
          display: grid;
          grid-template-columns: 60px 1fr 80px 60px 80px;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--color-border);
          color: var(--color-text-primary);
          text-decoration: none;
          transition: background-color var(--transition-fast);
        }
        .standings-row:last-child {
          border-bottom: none;
        }
        .standings-row:not(.standings-header):hover {
          background-color: var(--color-bg-secondary);
        }
        .standings-header {
          background-color: var(--color-bg-secondary);
          font-weight: var(--font-weight-semibold);
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .rank {
          font-weight: var(--font-weight-bold);
          font-size: var(--font-size-lg);
        }
        .player {
          font-weight: var(--font-weight-medium);
        }
        .stat {
          text-align: center;
          color: var(--color-text-secondary);
        }
        .points {
          color: var(--color-primary);
          font-weight: var(--font-weight-bold);
          font-size: var(--font-size-lg);
        }
        @media (max-width: 600px) {
          .standings-row {
            grid-template-columns: 50px 1fr 50px 50px 60px;
            padding: var(--space-3);
            font-size: var(--font-size-sm);
          }
          .points {
            font-size: var(--font-size-base);
          }
        }
      `}</style>
    </div>
  );
}
