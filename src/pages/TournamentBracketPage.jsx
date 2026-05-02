/**
 * TOURNAMENT BRACKET PAGE
 *
 * Public page that shows the live bracket for a specific tournament.
 * Uses Supabase Realtime to subscribe to changes so the bracket updates
 * automatically as the admin enters scores.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BracketDisplay from '../components/BracketDisplay';
import '../components/BracketDisplay.css';

export default function TournamentBracketPage() {
  const { tournamentId } = useParams();

  const [tournament, setTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();

    // Subscribe to realtime changes on this tournament's matches
    // Whenever a match changes, refetch the bracket so the UI updates live
    const channel = supabase
      .channel(`tournament_${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          // Realtime fires; reload the matches
          loadMatches();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadTournament(), loadMatches(), loadPlayers()]);
    setLoading(false);
  }

  async function loadTournament() {
    const { data } = await supabase
      .from('tournaments')
      .select('*, game_type:game_types(*)')
      .eq('id', tournamentId)
      .single();
    setTournament(data);
  }

  async function loadMatches() {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId);
    setMatches(data || []);
  }

  async function loadPlayers() {
    // Get all players who are checked in to this tournament
    const { data } = await supabase
      .from('tournament_players')
      .select('player:players(*)')
      .eq('tournament_id', tournamentId);
    setPlayers((data || []).map((tp) => tp.player));
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading"><div className="spinner"></div></div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>Tournament not found</h2>
          <Link to="/" className="btn btn-primary mt-4">Back to Home</Link>
        </div>
      </div>
    );
  }

  const formatDate = (s) => {
    if (!s) return '';
    return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="container">
      <div className="mb-6">
        <Link to="/" className="text-secondary">← Back</Link>
      </div>

      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h1 style={{ marginBottom: 0 }}>
          {tournament.name || formatDate(tournament.tournament_date)}
        </h1>
        <span className={`badge ${
          tournament.status === 'in_progress' ? 'badge-primary' :
          tournament.status === 'completed' ? 'badge-success' :
          'badge-neutral'
        }`}>
          {formatStatus(tournament.status)}
        </span>
      </div>
      <p className="text-secondary mb-6">
        {tournament.game_type?.name} · {players.length} players ·{' '}
        Best of {(tournament.games_to_win_override || tournament.game_type?.default_games_to_win || 2) * 2 - 1}
      </p>

      {matches.length === 0 ? (
        <div className="empty-state">
          <p>The bracket has not been generated yet.</p>
        </div>
      ) : (
        <BracketDisplay matches={matches} players={players} />
      )}
    </div>
  );
}

function formatStatus(status) {
  return {
    setup: 'Setup',
    in_progress: 'Live',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[status] || status;
}
