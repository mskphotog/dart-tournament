/**
 * BRACKET DISPLAY (stacked-card layout)
 * =============================================================================
 *
 * Renders the bracket as horizontal columns of round groups, with each match
 * shown as a card. This is the simpler, more reliable layout that doesn't
 * try to draw connector lines between matches. Sections (WB, LB, GF) stack
 * vertically; rounds within each section flow left-to-right.
 *
 * What this layout shows:
 *   - Match number labels (e.g. "(7" inside each card)
 *   - Seed numbers in WB Round 1 (when seedByPlayerId is provided)
 *   - L# notation in empty Loser's Bracket slots (e.g. "L7" = "loser of M7")
 *   - Bracket reset match with dashed border and "If First Loss" label
 *   - Bye matches as a small card with the auto-advancing player
 *
 * What it does NOT show (intentionally):
 *   - Connector lines between matches (too fragile in HTML/CSS, removed)
 *   - The classic tree structure (replaced with stacked card columns)
 *
 * Props:
 *   matches            - array of match records from the database
 *   players            - array of player records ({id, name, ...})
 *   seedByPlayerId     - optional map { playerId: seedNumber } for showing
 *                        seed numbers next to names in WB R1. Pages can
 *                        build this map from tournamentPlayers in one line.
 *                        If omitted, seeds simply won't display.
 *   onMatchClick       - optional callback (match) => void; makes cards tappable
 * =============================================================================
 */

import { useMemo } from 'react';
import './BracketDisplay.css';


// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function BracketDisplay({
  matches,
  players,
  seedByPlayerId,
  onMatchClick,
}) {
  // Build a player lookup keyed by player id
  const playerById = useMemo(() => {
    const map = {};
    for (const p of players) map[p.id] = p;
    return map;
  }, [players]);

  // Build a match lookup keyed by match id (for L# label resolution)
  const matchById = useMemo(() => {
    const map = {};
    for (const m of matches) map[m.id] = m;
    return map;
  }, [matches]);

  // Group matches by section and round
  const grouped = useMemo(() => groupMatches(matches), [matches]);

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="bracket-display">
      {/* Winner's Bracket section */}
      {grouped.winners.length > 0 && (
        <BracketSection
          title="Winner's Bracket"
          rounds={grouped.winners}
          playerById={playerById}
          matchById={matchById}
          seedByPlayerId={seedByPlayerId}
          onMatchClick={onMatchClick}
        />
      )}

      {/* Loser's Bracket section */}
      {grouped.losers.length > 0 && (
        <BracketSection
          title="Loser's Bracket"
          rounds={grouped.losers}
          playerById={playerById}
          matchById={matchById}
          seedByPlayerId={seedByPlayerId}
          onMatchClick={onMatchClick}
        />
      )}

      {/* Grand Final + Reset section */}
      {(grouped.grandFinal.length > 0 || grouped.grandFinalReset.length > 0) && (
        <BracketSection
          title="Grand Final"
          rounds={[
            // Single-round display: grand final card, then reset card
            {
              roundNumber: 1,
              matches: [...grouped.grandFinal, ...grouped.grandFinalReset],
            },
          ]}
          playerById={playerById}
          matchById={matchById}
          seedByPlayerId={seedByPlayerId}
          onMatchClick={onMatchClick}
          hideRoundLabels={true}
        />
      )}
    </div>
  );
}


// =============================================================================
// SECTION COMPONENT (one section: WB, LB, or Grand Final)
// =============================================================================

function BracketSection({
  title,
  rounds,
  playerById,
  matchById,
  seedByPlayerId,
  onMatchClick,
  hideRoundLabels,
}) {
  return (
    <div className="bracket-section">
      <h3 className="bracket-section-title">{title}</h3>
      <div className="bracket-section-scroll">
        <div className="bracket-rounds">
          {rounds.map((round) => (
            <div key={round.roundNumber} className="bracket-round">
              {!hideRoundLabels && (
                <div className="bracket-round-label">Round {round.roundNumber}</div>
              )}
              <div className="bracket-round-matches">
                {round.matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    playerById={playerById}
                    matchById={matchById}
                    seedByPlayerId={seedByPlayerId}
                    onClick={onMatchClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// MATCH CARD COMPONENT (one card representing one match)
// =============================================================================

function MatchCard({
  match,
  playerById,
  matchById,
  seedByPlayerId,
  onClick,
}) {
  const isBye = match.status === 'bye';
  const isReset = match.bracket === 'grand_final_reset';
  const isInteractive = typeof onClick === 'function' && !isBye;

  // Resolve display info for each slot
  const slot1 = resolveSlotDisplay(match, 1, playerById, matchById, seedByPlayerId);
  const slot2 = resolveSlotDisplay(match, 2, playerById, matchById, seedByPlayerId);

  // Highlight winner / loser
  const player1IsWinner = match.winner_id && match.winner_id === match.player1_id;
  const player2IsWinner = match.winner_id && match.winner_id === match.player2_id;
  const player1IsLoser = match.winner_id && match.winner_id === match.player2_id && match.player1_id;
  const player2IsLoser = match.winner_id && match.winner_id === match.player1_id && match.player2_id;

  // -------------------------------------------------------------------------
  // BYE CARD
  // -------------------------------------------------------------------------
  // Bye matches show a single auto-advancing player with no opponent or score
  if (isBye) {
    const advancingPlayer = match.player1_id ? playerById[match.player1_id] : null;
    const advancingSeed = advancingPlayer && seedByPlayerId
      ? seedByPlayerId[advancingPlayer.id]
      : null;

    return (
      <div className="match-card match-card-bye">
        {match.match_number && (
          <div className="match-card-number">({match.match_number}</div>
        )}
        <div className="match-card-player">
          {advancingSeed != null && (
            <span className="match-card-seed">{advancingSeed}</span>
          )}
          <span className="match-card-name">
            {advancingPlayer ? advancingPlayer.name : '\u2014'}
          </span>
        </div>
        <div className="match-card-bye-label">Auto-advance</div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // STANDARD CARD (including the bracket reset, which uses dashed styling)
  // -------------------------------------------------------------------------
  let cls = 'match-card';
  if (match.status === 'in_progress') cls += ' match-card-in-progress';
  if (match.status === 'completed') cls += ' match-card-completed';
  if (isReset) cls += ' match-card-reset';
  if (isInteractive) cls += ' match-card-interactive';

  return (
    <div
      className={cls}
      onClick={isInteractive ? () => onClick(match) : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {/* Header: match number + optional reset label */}
      <div className="match-card-header">
        {match.match_number && (
          <span className="match-card-number">({match.match_number}</span>
        )}
        {isReset && (
          <span className="match-card-reset-label">If First Loss</span>
        )}
      </div>

      {/* Player 1 row */}
      <PlayerRow
        slot={slot1}
        isWinner={player1IsWinner}
        isLoser={player1IsLoser}
      />

      {/* Player 2 row */}
      <PlayerRow
        slot={slot2}
        isWinner={player2IsWinner}
        isLoser={player2IsLoser}
      />

      {/* Status indicator */}
      <div className="match-card-status">
        <StatusBadge status={match.status} />
      </div>
    </div>
  );
}


// =============================================================================
// PLAYER ROW (one player slot inside a match card)
// =============================================================================

function PlayerRow({ slot, isWinner, isLoser }) {
  let cls = 'match-card-player';
  if (isWinner) cls += ' match-card-player-winner';
  if (isLoser) cls += ' match-card-player-loser';
  if (slot.isPlaceholder) cls += ' match-card-player-placeholder';

  return (
    <div className={cls}>
      {/* Seed prefix (only shown when present, only for WB R1 with real player) */}
      {slot.seed != null && (
        <span className="match-card-seed">{slot.seed}</span>
      )}

      {/* Player name or placeholder label (TBD, L#, etc.) */}
      <span className="match-card-name">{slot.label}</span>

      {/* Score (only for matches that have been played or are in progress) */}
      {slot.score != null && (
        <span className="match-card-score">{slot.score}</span>
      )}
    </div>
  );
}


// =============================================================================
// STATUS BADGE
// =============================================================================

function StatusBadge({ status }) {
  const labels = {
    pending: { text: 'Waiting', cls: 'badge-neutral' },
    ready: { text: 'Ready', cls: 'badge-secondary' },
    in_progress: { text: 'In Progress', cls: 'badge-primary' },
    completed: { text: 'Completed', cls: 'badge-success' },
    bye: { text: 'Bye', cls: 'badge-neutral' },
  };
  const l = labels[status] || { text: status, cls: 'badge-neutral' };
  return <span className={`badge ${l.cls}`}>{l.text}</span>;
}


// =============================================================================
// HELPERS: grouping and slot resolution
// =============================================================================

/**
 * Group all matches by section (WB / LB / Grand Final / Reset) and round.
 * Returns sorted, ready-to-render structure.
 */
function groupMatches(matches) {
  const winners = {};
  const losers = {};
  const grandFinal = [];
  const grandFinalReset = [];

  for (const m of matches) {
    if (m.bracket === 'winners') {
      if (!winners[m.round]) winners[m.round] = [];
      winners[m.round].push(m);
    } else if (m.bracket === 'losers') {
      if (!losers[m.round]) losers[m.round] = [];
      losers[m.round].push(m);
    } else if (m.bracket === 'grand_final') {
      grandFinal.push(m);
    } else if (m.bracket === 'grand_final_reset') {
      grandFinalReset.push(m);
    }
  }

  // Sort matches within each round by match_number ascending
  // (LB byes have no match_number; sort them last by stable order)
  const sortByMatchNumber = (a, b) => {
    if (a.match_number == null && b.match_number == null) return 0;
    if (a.match_number == null) return 1;
    if (b.match_number == null) return -1;
    return a.match_number - b.match_number;
  };

  const sortedWinners = Object.keys(winners)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => ({
      roundNumber: r,
      matches: winners[r].sort(sortByMatchNumber),
    }));

  const sortedLosers = Object.keys(losers)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => ({
      roundNumber: r,
      matches: losers[r].sort(sortByMatchNumber),
    }));

  return {
    winners: sortedWinners,
    losers: sortedLosers,
    grandFinal,
    grandFinalReset,
  };
}


/**
 * Resolve what to display for one slot of a match.
 *
 * Returns: {
 *   label: string,        // text to show (player name, "L7", or "TBD")
 *   seed: number | null,  // seed number (only for WB R1 with real player)
 *   score: number | null, // games won (or null if not applicable)
 *   isPlaceholder: bool,  // true if showing a placeholder label, not a real name
 * }
 */
function resolveSlotDisplay(match, slotNumber, playerById, matchById, seedByPlayerId) {
  const playerId = slotNumber === 1 ? match.player1_id : match.player2_id;
  const score = slotNumber === 1 ? match.player1_score : match.player2_score;
  const isWbRound1 = match.bracket === 'winners' && match.round === 1;

  // Real player assigned: show name (and seed if WB R1 and seedByPlayerId given)
  if (playerId) {
    const player = playerById[playerId];
    const seed = (isWbRound1 && seedByPlayerId)
      ? (seedByPlayerId[playerId] || null)
      : null;

    return {
      label: player ? player.name : 'Unknown',
      seed,
      score: score != null ? score : 0,
      isPlaceholder: false,
    };
  }

  // No player yet: figure out an appropriate placeholder
  let label = 'TBD';
  if (match.bracket === 'losers') {
    label = getLbSlotLabel(match, slotNumber, matchById) || 'TBD';
  }

  return {
    label,
    seed: null,
    score: null,
    isPlaceholder: true,
  };
}


/**
 * For an empty LB slot, find the WB match whose loser is scheduled to drop here
 * and return "L<that match's match_number>". Returns null if no such WB match
 * exists (meaning the slot will fill from a previous LB winner, in which case
 * "TBD" is the right placeholder).
 */
function getLbSlotLabel(match, slotNumber, matchById) {
  for (const m of Object.values(matchById)) {
    if (
      m.next_match_loser_id === match.id &&
      m.next_match_loser_slot === slotNumber &&
      m.match_number != null
    ) {
      return `L${m.match_number}`;
    }
  }
  return null;
}
