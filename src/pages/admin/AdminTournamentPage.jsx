/**
 * ADMIN TOURNAMENT PAGE
 *
 * The main admin workspace for running a single tournament. Three modes
 * based on tournament status:
 *
 *  1. SETUP    - Check-in players (roster + walk-ins), then generate bracket
 *  2. IN_PROGRESS - Live scoring: tap a match, record game results, advance players
 *                   Admin overrides: force winner, undo match, swap players
 *  3. COMPLETED - Read-only view with final standings and audit log
 *
 * The bracket display from the public page is reused here, but with an
 * onMatchClick handler that opens a scoring modal.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  generateAndSaveBracket,
  recordGameResult,
  adminForceWinner,
  adminUndoMatch,
  adminSwapPlayers,
} from '../../lib/bracketDb';
import BracketDisplay from '../../components/BracketDisplay';
import '../../components/BracketDisplay.css';

export default function AdminTournamentPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();

  // Core data
  const [tournament, setTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [tournamentPlayers, setTournamentPlayers] = useState([]); // checked-in players for this tournament
  const [allPlayers, setAllPlayers] = useState([]); // every active player in the system
  const [loading, setLoading] = useState(true);

  // Check-in UI state
  const [checkInSearch, setCheckInSearch] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [checkInError, setCheckInError] = useState('');

  // Bracket generation state
  const [generatingBracket, setGeneratingBracket] = useState(false);
  const [bracketError, setBracketError] = useState('');

  // Match scoring modal state
  const [scoringMatch, setScoringMatch] = useState(null);
  const [scoringError, setScoringError] = useState('');

  // Initial load + realtime subscription so the bracket auto-updates
  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel(`admin_tournament_${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
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
    await Promise.all([
      loadTournament(),
      loadMatches(),
      loadTournamentPlayers(),
      loadAllPlayers(),
    ]);
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

  async function loadTournamentPlayers() {
    const { data } = await supabase
      .from('tournament_players')
      .select('*, player:players(*)')
      .eq('tournament_id', tournamentId)
      .order('checked_in_at', { ascending: true });
    setTournamentPlayers(data || []);
  }

  async function loadAllPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    setAllPlayers(data || []);
  }

  // ---------------------------------------------------------------------------
  // CHECK-IN ACTIONS
  // ---------------------------------------------------------------------------

  // Toggle a roster player's check-in status
  async function toggleRosterCheckIn(player) {
    setCheckInError('');
    const existing = tournamentPlayers.find((tp) => tp.player_id === player.id);

    if (existing) {
      // Remove
      await supabase.from('tournament_players').delete().eq('id', existing.id);
    } else {
      // Add
      const { error } = await supabase.from('tournament_players').insert({
        tournament_id: tournamentId,
        player_id: player.id,
      });
      if (error) {
        setCheckInError(error.message);
        return;
      }
    }
    await loadTournamentPlayers();
  }

  // Add a brand new walk-in player and check them in
  async function handleAddWalkIn(e) {
    e.preventDefault();
    setCheckInError('');

    const trimmedName = walkInName.trim();
    if (!trimmedName) return;

    // Step 1: create the player record (as a walk-in)
    const { data: newPlayer, error: playerError } = await supabase
      .from('players')
      .insert({
        name: trimmedName,
        is_roster: false,
        is_active: true,
      })
      .select()
      .single();

    if (playerError) {
      setCheckInError(playerError.message);
      return;
    }

    // Step 2: check them in to this tournament
    const { error: checkInError } = await supabase.from('tournament_players').insert({
      tournament_id: tournamentId,
      player_id: newPlayer.id,
    });

    if (checkInError) {
      setCheckInError(checkInError.message);
      return;
    }

    setWalkInName('');
    await Promise.all([loadTournamentPlayers(), loadAllPlayers()]);
  }

  // ---------------------------------------------------------------------------
  // BRACKET GENERATION
  // ---------------------------------------------------------------------------

  async function handleGenerateBracket() {
    setBracketError('');

    if (tournamentPlayers.length < 2) {
      setBracketError('Need at least 2 checked-in players');
      return;
    }

    const ok = window.confirm(
      `Generate the bracket with ${tournamentPlayers.length} players? Once generated, players cannot be added or removed without regenerating.`
    );
    if (!ok) return;

    setGeneratingBracket(true);
    const result = await generateAndSaveBracket(tournamentId);
    setGeneratingBracket(false);

    if (!result.success) {
      setBracketError(result.error || 'Failed to generate bracket');
      return;
    }

    // Reload everything since status changed and matches were created
    await loadAll();
  }

  // Regenerate bracket (for cases where admin needs to redo it before play starts)
  async function handleRegenerateBracket() {
    const ok = window.confirm(
      'Regenerate the bracket? This will erase all current matches and create a new random bracket. This cannot be undone.'
    );
    if (!ok) return;

    setGeneratingBracket(true);
    const result = await generateAndSaveBracket(tournamentId);
    setGeneratingBracket(false);

    if (!result.success) {
      setBracketError(result.error || 'Failed to regenerate bracket');
      return;
    }

    await loadAll();
  }

  // ---------------------------------------------------------------------------
  // CANCEL TOURNAMENT
  // ---------------------------------------------------------------------------

  async function handleCancelTournament() {
    const ok = window.confirm(
      'Cancel this tournament? It will be marked as cancelled and removed from the active list. This cannot be undone.'
    );
    if (!ok) return;

    await supabase
      .from('tournaments')
      .update({ status: 'cancelled' })
      .eq('id', tournamentId);
    navigate('/admin');
  }

  // ---------------------------------------------------------------------------
  // SCORING MODAL HANDLERS
  // ---------------------------------------------------------------------------

  function openScoringModal(match) {
    // Don't open modal for matches that aren't ready / in progress
    // (pending matches have TBD players, byes are auto-resolved)
    if (match.status === 'pending' || match.status === 'bye') return;
    setScoringError('');
    setScoringMatch(match);
  }

  function closeScoringModal() {
    setScoringMatch(null);
    setScoringError('');
  }

  // Record a single game's winner within the open match
  async function handleRecordGame(winnerId) {
    if (!scoringMatch) return;
    setScoringError('');

    const result = await recordGameResult(scoringMatch.id, winnerId);

    if (!result.success) {
      setScoringError(result.error || 'Failed to record game');
      return;
    }

    // If the match is now complete, close the modal
    if (result.matchCompleted) {
      closeScoringModal();
    } else {
      // Refresh the match data so the modal shows the new score
      const { data: updatedMatch } = await supabase
        .from('matches')
        .select('*')
        .eq('id', scoringMatch.id)
        .single();
      setScoringMatch(updatedMatch);
    }

    // Always refresh matches list
    await loadMatches();
    // Tournament status may have changed if grand final completed
    await loadTournament();
  }

  // Force a winner (bypasses individual game tracking)
  async function handleForceWinner(winnerId) {
    if (!scoringMatch) return;
    const reason = window.prompt('Reason for forcing winner (optional):') || 'Admin forced winner';

    const result = await adminForceWinner(scoringMatch.id, winnerId, reason);

    if (!result.success) {
      setScoringError(result.error || 'Failed to force winner');
      return;
    }

    closeScoringModal();
    await loadMatches();
    await loadTournament();
  }

  // Undo a completed match's result
  async function handleUndoMatch() {
    if (!scoringMatch) return;
    const ok = window.confirm(
      'Undo this match? The result will be cleared, players will need to play again, and any downstream matches affected will also be reset.'
    );
    if (!ok) return;

    const reason = window.prompt('Reason for undo:') || 'Admin undid match';

    const result = await adminUndoMatch(scoringMatch.id, reason);

    if (!result.success) {
      setScoringError(result.error || 'Failed to undo match');
      return;
    }

    closeScoringModal();
    await loadMatches();
    await loadTournament();
  }

  // Swap player1 and player2 (only allowed before play starts)
  async function handleSwapPlayers() {
    if (!scoringMatch) return;
    const reason = window.prompt('Reason for swap (optional):') || 'Admin swapped players';

    const result = await adminSwapPlayers(scoringMatch.id, reason);

    if (!result.success) {
      setScoringError(result.error || 'Failed to swap players');
      return;
    }

    // Refresh modal data
    const { data: updatedMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('id', scoringMatch.id)
      .single();
    setScoringMatch(updatedMatch);
    await loadMatches();
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

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
          <Link to="/admin" className="btn btn-primary mt-4">Back to Dashboard</Link>
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

  // Players list for the BracketDisplay component
  const playerListForBracket = tournamentPlayers.map((tp) => tp.player);

  // Roster filtered for check-in: active players, not already checked in
  const checkedInIds = new Set(tournamentPlayers.map((tp) => tp.player_id));
  const searchLower = checkInSearch.trim().toLowerCase();
  const eligibleRoster = allPlayers.filter((p) => {
    if (!p.is_roster) return false; // Only show roster regulars in the list
    if (searchLower && !p.name.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  return (
    <div className="container">
      {/* Header */}
      <div className="mb-4">
        <Link to="/admin" className="text-secondary">← Back to Dashboard</Link>
      </div>

      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h1 style={{ marginBottom: 0 }}>
          {tournament.name || formatDate(tournament.tournament_date)}
        </h1>
        <span className={`badge ${
          tournament.status === 'in_progress' ? 'badge-primary' :
          tournament.status === 'completed' ? 'badge-success' :
          tournament.status === 'cancelled' ? 'badge-error' :
          'badge-warning'
        }`}>
          {formatStatus(tournament.status)}
        </span>
      </div>
      <p className="text-secondary mb-6">
        {tournament.game_type?.name} · Best of{' '}
        {(tournament.games_to_win_override || tournament.game_type?.default_games_to_win || 2) * 2 - 1}
        {' · '}
        {tournamentPlayers.length} player{tournamentPlayers.length !== 1 ? 's' : ''}
      </p>

      {/* Public bracket link */}
      <div className="card mb-6" style={{ backgroundColor: 'var(--color-secondary-light)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <strong>Public bracket URL:</strong>
            <div className="text-secondary" style={{ wordBreak: 'break-all', fontSize: 'var(--font-size-sm)' }}>
              {window.location.origin}/tournament/{tournamentId}
            </div>
          </div>
          <Link
            to={`/tournament/${tournamentId}`}
            className="btn btn-sm btn-secondary"
            target="_blank"
          >
            Open Public View
          </Link>
        </div>
      </div>

      {/* MODE: SETUP - Check-in and bracket generation */}
      {tournament.status === 'setup' && (
        <SetupMode
          tournamentPlayers={tournamentPlayers}
          eligibleRoster={eligibleRoster}
          checkedInIds={checkedInIds}
          checkInSearch={checkInSearch}
          setCheckInSearch={setCheckInSearch}
          walkInName={walkInName}
          setWalkInName={setWalkInName}
          checkInError={checkInError}
          bracketError={bracketError}
          generatingBracket={generatingBracket}
          onToggleCheckIn={toggleRosterCheckIn}
          onAddWalkIn={handleAddWalkIn}
          onGenerateBracket={handleGenerateBracket}
          onCancel={handleCancelTournament}
        />
      )}

      {/* MODE: IN_PROGRESS - Live scoring */}
      {tournament.status === 'in_progress' && (
        <InProgressMode
          matches={matches}
          players={playerListForBracket}
          onMatchClick={openScoringModal}
          onRegenerateBracket={handleRegenerateBracket}
          generatingBracket={generatingBracket}
        />
      )}

      {/* MODE: COMPLETED - Final results */}
      {tournament.status === 'completed' && (
        <CompletedMode
          matches={matches}
          players={playerListForBracket}
          tournamentPlayers={tournamentPlayers}
          onMatchClick={openScoringModal}
        />
      )}

      {/* MODE: CANCELLED */}
      {tournament.status === 'cancelled' && (
        <div className="empty-state">
          <p>This tournament was cancelled.</p>
        </div>
      )}

      {/* Scoring modal (shared across modes) */}
      {scoringMatch && (
        <ScoringModal
          match={scoringMatch}
          players={playerListForBracket}
          tournamentStatus={tournament.status}
          onRecordGame={handleRecordGame}
          onForceWinner={handleForceWinner}
          onUndoMatch={handleUndoMatch}
          onSwapPlayers={handleSwapPlayers}
          onClose={closeScoringModal}
          error={scoringError}
        />
      )}
    </div>
  );
}


// ============================================================================
// SETUP MODE: Check-in players and generate bracket
// ============================================================================

function SetupMode({
  tournamentPlayers,
  eligibleRoster,
  checkedInIds,
  checkInSearch,
  setCheckInSearch,
  walkInName,
  setWalkInName,
  checkInError,
  bracketError,
  generatingBracket,
  onToggleCheckIn,
  onAddWalkIn,
  onGenerateBracket,
  onCancel,
}) {
  return (
    <>
      <div className="card mb-6">
        <h2>Check-In Players</h2>
        <p className="text-secondary mb-4">
          Tap a roster player to toggle their check-in. Add walk-ins below if a new
          player shows up tonight.
        </p>

        {/* Roster search */}
        <div className="form-group">
          <input
            type="text"
            className="form-input"
            placeholder="Search roster..."
            value={checkInSearch}
            onChange={(e) => setCheckInSearch(e.target.value)}
          />
        </div>

        {/* Roster checklist */}
        {eligibleRoster.length === 0 ? (
          <p className="text-secondary">
            {checkInSearch ? 'No matching roster players.' : 'No roster players yet. Add some on the Players page or use Walk-In below.'}
          </p>
        ) : (
          <div className="roster-grid">
            {eligibleRoster.map((p) => {
              const isCheckedIn = checkedInIds.has(p.id);
              return (
                <button
                  key={p.id}
                  className={`roster-toggle ${isCheckedIn ? 'checked' : ''}`}
                  onClick={() => onToggleCheckIn(p)}
                >
                  <span className="roster-toggle-icon">{isCheckedIn ? '✓' : '+'}</span>
                  <span className="roster-toggle-name">{p.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Add walk-in */}
      <div className="card mb-6">
        <h2>Add Walk-In</h2>
        <p className="text-secondary mb-4">
          For new players who aren't on the roster yet. They'll be saved as a walk-in
          and checked in to this tournament. You can promote them to roster later.
        </p>
        <form onSubmit={onAddWalkIn} className="flex gap-2 flex-wrap">
          <input
            type="text"
            className="form-input"
            placeholder="Walk-in player name"
            value={walkInName}
            onChange={(e) => setWalkInName(e.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
          />
          <button type="submit" className="btn btn-secondary">
            Add Walk-In
          </button>
        </form>
        {checkInError && <div className="form-error mt-3">{checkInError}</div>}
      </div>

      {/* Currently checked-in players */}
      <div className="card mb-6">
        <h2>Checked In ({tournamentPlayers.length})</h2>
        {tournamentPlayers.length === 0 ? (
          <p className="text-secondary">No players checked in yet.</p>
        ) : (
          <div className="checked-in-list">
            {tournamentPlayers.map((tp) => (
              <div key={tp.id} className="checked-in-pill">
                <span>{tp.player.name}</span>
                {!tp.player.is_roster && <span className="badge badge-neutral">Walk-in</span>}
                <button
                  className="checked-in-remove"
                  onClick={() => onToggleCheckIn(tp.player)}
                  aria-label={`Remove ${tp.player.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate bracket */}
      <div className="card">
        <h2>Generate Bracket</h2>
        <p className="text-secondary mb-4">
          Once all players have checked in, generate the bracket to begin the tournament.
          Seeding and byes are randomized. {tournamentPlayers.length < 2 && 'You need at least 2 players.'}
        </p>
        {bracketError && <div className="form-error mb-3">{bracketError}</div>}
        <div className="flex gap-3 flex-wrap">
          <button
            className="btn btn-primary"
            onClick={onGenerateBracket}
            disabled={generatingBracket || tournamentPlayers.length < 2}
          >
            {generatingBracket ? 'Generating...' : `Generate Bracket (${tournamentPlayers.length} players)`}
          </button>
          <button className="btn btn-danger" onClick={onCancel}>
            Cancel Tournament
          </button>
        </div>
      </div>

      <style>{`
        .roster-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: var(--space-2);
        }
        .roster-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3);
          background-color: var(--color-bg-card);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-primary);
          font-size: var(--font-size-base);
          font-weight: var(--font-weight-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          text-align: left;
          min-height: 48px;
        }
        .roster-toggle:hover {
          border-color: var(--color-primary);
        }
        .roster-toggle.checked {
          background-color: var(--color-success-light);
          border-color: var(--color-success);
          color: var(--color-success);
        }
        .roster-toggle-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: var(--color-bg-secondary);
          font-weight: var(--font-weight-bold);
        }
        .roster-toggle.checked .roster-toggle-icon {
          background-color: var(--color-success);
          color: white;
        }
        .roster-toggle-name {
          flex: 1;
        }
        .checked-in-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .checked-in-pill {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background-color: var(--color-primary-light);
          color: var(--color-primary);
          border-radius: var(--radius-full);
          font-weight: var(--font-weight-medium);
        }
        .checked-in-remove {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background-color: var(--color-primary);
          color: white;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
        }
        .checked-in-remove:hover {
          background-color: var(--color-primary-hover);
        }
      `}</style>
    </>
  );
}


// ============================================================================
// IN_PROGRESS MODE: Live scoring
// ============================================================================

function InProgressMode({ matches, players, onMatchClick, onRegenerateBracket, generatingBracket }) {
  // Determine if any match has been scored yet
  const anyMatchPlayed = matches.some(
    (m) => m.status === 'in_progress' || m.status === 'completed'
  );

  return (
    <>
      <div className="card mb-6" style={{ backgroundColor: 'var(--color-warning-light)' }}>
        <h2 style={{ color: '#856404' }}>Live Scoring</h2>
        <p style={{ color: '#856404', marginBottom: 0 }}>
          Tap any match to record game results. Matches highlighted in orange are in progress.
          Greyed-out matches are waiting for upstream results.
        </p>
      </div>

      <BracketDisplay
        matches={matches}
        players={players}
        onMatchClick={onMatchClick}
      />

      {/* Admin controls at the bottom */}
      <div className="card mt-6">
        <h3>Admin Tools</h3>
        <p className="text-secondary mb-4">
          For corrections to individual matches, tap the match in the bracket above.
        </p>
        {!anyMatchPlayed && (
          <button
            className="btn btn-outline"
            onClick={onRegenerateBracket}
            disabled={generatingBracket}
          >
            {generatingBracket ? 'Regenerating...' : 'Regenerate Bracket'}
          </button>
        )}
        {anyMatchPlayed && (
          <p className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            Bracket regeneration is locked once games have been played. Use the per-match override tools instead.
          </p>
        )}
      </div>
    </>
  );
}


// ============================================================================
// COMPLETED MODE: Final standings
// ============================================================================

function CompletedMode({ matches, players, tournamentPlayers, onMatchClick }) {
  // Sort by final placement (1, 2, 3, ...)
  const finalStandings = [...tournamentPlayers]
    .filter((tp) => tp.final_placement)
    .sort((a, b) => a.final_placement - b.final_placement);

  return (
    <>
      {/* Final standings */}
      <div className="card mb-6">
        <h2>Final Standings</h2>
        {finalStandings.length === 0 ? (
          <p className="text-secondary">No final standings recorded.</p>
        ) : (
          <div className="final-standings">
            {finalStandings.map((tp) => (
              <div key={tp.id} className="final-standings-row">
                <div className="final-placement">
                  {tp.final_placement === 1 ? '🥇' :
                   tp.final_placement === 2 ? '🥈' :
                   tp.final_placement === 3 ? '🥉' :
                   `#${tp.final_placement}`}
                </div>
                <div className="final-name">{tp.player.name}</div>
                <div className="final-points">
                  <span className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                    {tp.win_points || 0} wins + {tp.placement_points || 0} bonus =
                  </span>
                  <span className="text-primary-color font-bold" style={{ fontSize: 'var(--font-size-lg)', marginLeft: 'var(--space-2)' }}>
                    {(tp.win_points || 0) + (tp.placement_points || 0)} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Read-only bracket (still clickable for admin reference / undo if needed) */}
      <h2>Bracket</h2>
      <BracketDisplay
        matches={matches}
        players={players}
        onMatchClick={onMatchClick}
      />

      <style>{`
        .final-standings {
          display: flex;
          flex-direction: column;
        }
        .final-standings-row {
          display: grid;
          grid-template-columns: 60px 1fr auto;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          border-bottom: 1px solid var(--color-border);
        }
        .final-standings-row:last-child {
          border-bottom: none;
        }
        .final-placement {
          font-size: var(--font-size-2xl);
          font-weight: var(--font-weight-bold);
          text-align: center;
        }
        .final-name {
          font-size: var(--font-size-lg);
          font-weight: var(--font-weight-semibold);
        }
        .final-points {
          text-align: right;
        }
        @media (max-width: 600px) {
          .final-standings-row {
            grid-template-columns: 50px 1fr;
            grid-template-rows: auto auto;
          }
          .final-points {
            grid-column: 2;
            text-align: left;
          }
        }
      `}</style>
    </>
  );
}


// ============================================================================
// SCORING MODAL
// ============================================================================
//
// Pops up when admin taps a match in the bracket. Provides:
//  - Big buttons for "Game won by Player 1" and "Game won by Player 2"
//  - Live score display
//  - Override actions: force winner, undo (if completed), swap players (if not started)
//
function ScoringModal({
  match,
  players,
  tournamentStatus,
  onRecordGame,
  onForceWinner,
  onUndoMatch,
  onSwapPlayers,
  onClose,
  error,
}) {
  // Look up player names
  const playerById = {};
  for (const p of players) playerById[p.id] = p;
  const player1 = match.player1_id ? playerById[match.player1_id] : null;
  const player2 = match.player2_id ? playerById[match.player2_id] : null;

  // Match descriptors
  const bracketLabel = {
    winners: "Winner's Bracket",
    losers: "Loser's Bracket",
    grand_final: 'Grand Final',
    grand_final_reset: 'Bracket Reset',
  }[match.bracket] || match.bracket;

  const isCompleted = match.status === 'completed';
  const canSwap = match.status === 'ready' && !match.winner_id;
  const canRecord = match.status === 'ready' || match.status === 'in_progress';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="text-secondary mb-2" style={{ fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {bracketLabel} · Round {match.round} · Match {match.match_number}
        </div>
        <h2>
          Best of {match.games_to_win * 2 - 1}
        </h2>

        {/* Score display */}
        <div className="score-display mb-4">
          <div className={`score-side ${match.winner_id === match.player1_id ? 'winner' : ''}`}>
            <div className="score-name">{player1 ? player1.name : 'TBD'}</div>
            <div className="score-number">{match.player1_score || 0}</div>
          </div>
          <div className="score-vs">vs</div>
          <div className={`score-side ${match.winner_id === match.player2_id ? 'winner' : ''}`}>
            <div className="score-name">{player2 ? player2.name : 'TBD'}</div>
            <div className="score-number">{match.player2_score || 0}</div>
          </div>
        </div>

        {error && <div className="form-error mb-3">{error}</div>}

        {/* Record game buttons (when match is live) */}
        {canRecord && player1 && player2 && (
          <div className="mb-4">
            <p className="text-secondary mb-2" style={{ fontSize: 'var(--font-size-sm)' }}>
              Tap which player won this game:
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                className="btn btn-primary"
                style={{ flex: 1, minWidth: '140px' }}
                onClick={() => onRecordGame(match.player1_id)}
              >
                {player1.name} won
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, minWidth: '140px' }}
                onClick={() => onRecordGame(match.player2_id)}
              >
                {player2.name} won
              </button>
            </div>
            <p className="text-secondary mt-2" style={{ fontSize: 'var(--font-size-sm)' }}>
              First to {match.games_to_win} games wins the match.
            </p>
          </div>
        )}

        {/* Completed match info */}
        {isCompleted && (
          <div className="card mb-4" style={{ backgroundColor: 'var(--color-success-light)', padding: 'var(--space-3)' }}>
            <strong style={{ color: 'var(--color-success)' }}>
              Winner: {match.winner_id === match.player1_id ? player1?.name : player2?.name}
            </strong>
          </div>
        )}

        {/* Admin overrides */}
        <div className="modal-section">
          <h3>Admin Overrides</h3>
          <div className="flex flex-col gap-2">
            {/* Force winner: works for ready, in-progress matches */}
            {canRecord && player1 && player2 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => onForceWinner(match.player1_id)}
                >
                  Force {player1.name} Win
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => onForceWinner(match.player2_id)}
                >
                  Force {player2.name} Win
                </button>
              </div>
            )}

            {/* Swap: only when match is ready (not yet started) */}
            {canSwap && (
              <button
                className="btn btn-sm btn-outline"
                onClick={onSwapPlayers}
                style={{ alignSelf: 'flex-start' }}
              >
                Swap Player Positions
              </button>
            )}

            {/* Undo: only completed matches */}
            {isCompleted && (
              <button
                className="btn btn-sm btn-danger"
                onClick={onUndoMatch}
                style={{ alignSelf: 'flex-start' }}
              >
                Undo Match Result
              </button>
            )}

            {/* Pending: nothing actionable */}
            {match.status === 'pending' && (
              <p className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                This match is waiting on results from earlier rounds. Override actions
                will be available once both players are determined.
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: var(--space-4);
        }
        .modal-content {
          background-color: var(--color-bg-card);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
          max-width: 500px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          box-shadow: var(--shadow-lg);
        }
        .modal-close {
          position: absolute;
          top: var(--space-3);
          right: var(--space-3);
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background-color: var(--color-bg-secondary);
          color: var(--color-text-primary);
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-close:hover {
          background-color: var(--color-border-strong);
        }
        .modal-section {
          padding-top: var(--space-4);
          border-top: 1px solid var(--color-border);
        }
        .score-display {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-4);
          background-color: var(--color-bg-primary);
          border-radius: var(--radius-md);
        }
        .score-side {
          text-align: center;
          padding: var(--space-3);
          border-radius: var(--radius-md);
        }
        .score-side.winner {
          background-color: var(--color-success-light);
          color: var(--color-success);
        }
        .score-name {
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-semibold);
          margin-bottom: var(--space-1);
          word-break: break-word;
        }
        .score-number {
          font-size: var(--font-size-3xl);
          font-weight: var(--font-weight-bold);
        }
        .score-vs {
          color: var(--color-text-tertiary);
          font-weight: var(--font-weight-semibold);
        }
      `}</style>
    </div>
  );
}


// ============================================================================
// HELPERS
// ============================================================================

function formatStatus(status) {
  return {
    setup: 'Setup',
    in_progress: 'Live',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[status] || status;
}
