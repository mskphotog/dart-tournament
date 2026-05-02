/**
 * PLAYER PROFILE PAGE
 *
 * Public page showing a single player's stats and tournament history.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function PlayerProfilePage() {
  const { playerId } = useParams();

  const [player, setPlayer] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  async function loadAll() {
    setLoading(true);

    // Load player record
    const { data: p } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();
    setPlayer(p);

    // Load tournament history
    const { data: h } = await supabase
      .from('tournament_players')
      .select('*, tournament:tournaments(*, game_type:game_types(name))')
      .eq('player_id', playerId)
      .order('checked_in_at', { ascending: false });
    setHistory(h || []);

    // Load aggregate stats from the standings view
    const { data: s } = await supabase
      .from('season_standings')
      .select('*')
      .eq('player_id', playerId)
      .single();
    setStats(s);

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading"><div className="spinner"></div></div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>Player not found</h2>
          <Link to="/" className="btn btn-primary mt-4">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="mb-6">
        <Link to="/standings" className="text-secondary">← Back to Standings</Link>
      </div>

      <h1>{player.name}</h1>

      {/* Stats grid */}
      {stats && (
        <div className="stats-grid mb-6">
          <StatCard label="Total Points" value={stats.total_points} accent />
          <StatCard label="Tournaments" value={stats.tournaments_played} />
          <StatCard label="Wins" value={stats.tournaments_won} />
          <StatCard label="Win Points" value={stats.total_win_points} />
        </div>
      )}

      {/* Tournament history */}
      <h2>Tournament History</h2>
      {history.length === 0 ? (
        <div className="empty-state">
          <p>No tournaments played yet.</p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((tp) => (
            <Link
              key={tp.id}
              to={`/tournament/${tp.tournament.id}`}
              className="card card-hover history-item"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="mb-1">
                    {tp.tournament.name ||
                      new Date(tp.tournament.tournament_date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                  </h3>
                  <p className="text-secondary mb-2">
                    {tp.tournament.game_type?.name}
                  </p>
                </div>
                <div className="text-right">
                  {tp.final_placement && (
                    <div className="placement">
                      {tp.final_placement === 1 ? '🥇 Champion' :
                       tp.final_placement === 2 ? '🥈 Runner-up' :
                       tp.final_placement === 3 ? '🥉 3rd Place' :
                       `#${tp.final_placement}`}
                    </div>
                  )}
                  <div className="text-secondary">
                    {(tp.win_points || 0) + (tp.placement_points || 0)} pts
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: var(--space-3);
        }
        .history-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .history-item {
          text-decoration: none;
          color: inherit;
        }
        .placement {
          font-weight: var(--font-weight-semibold);
          font-size: var(--font-size-base);
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="card">
      <div className="text-secondary mb-1" style={{ fontSize: 'var(--font-size-sm)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-3xl)',
          fontWeight: 'var(--font-weight-bold)',
          color: accent ? 'var(--color-primary)' : 'var(--color-text-primary)',
        }}
      >
        {value || 0}
      </div>
    </div>
  );
}
