/**
 * BRACKET DATABASE OPERATIONS
 *
 * Wraps the bracket generation logic with Supabase persistence. Handles:
 *  - Saving a freshly generated bracket to the database
 *  - Recording game results and advancing players through the bracket
 *  - Auto-advancing players through LB bye matches (single-feeder LB matches
 *    where only one player will ever arrive, so no game is played)
 *  - Calculating final placements and awarding season points
 *  - Admin overrides (force winner, swap players, undo result)
 *
 * IMPORTANT NOTE ON LB BYES
 * -------------------------
 * Some Loser's Bracket matches have only one feeder match (one player
 * dropping in, no opponent). These are unavoidable when the bracket math
 * requires it (e.g., consolidation rounds with an odd number of LB matches).
 * The bracket generator marks these matches with `is_lb_bye: true` in memory,
 * but we don't store that flag in the database. Instead, we detect LB byes
 * at runtime by counting how many matches point INTO each match. If only
 * one match points in, it's an LB bye.
 *
 * When a player gets placed into an LB bye match, we don't wait for an
 * opponent. We immediately:
 *   1. Mark the bye match status='bye' and set winner_id = the placed player
 *   2. Recursively advance the player to that match's next_match_winner_id
 * This handles chained LB byes correctly (rare but possible).
 */

import { supabase } from './supabase';
import { generateDoubleEliminationBracket } from './bracket';


// =============================================================================
// BRACKET CREATION
// =============================================================================

/**
 * Generate a bracket for a tournament and save it to the database.
 *
 * @param {string} tournamentId - The tournament UUID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function generateAndSaveBracket(tournamentId, topSeedPlayerId = null) {
  try {
    // Step 1: Load tournament details (need games_to_win value)
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('*, game_type:game_types(*)')
      .eq('id', tournamentId)
      .single();

    if (tErr || !tournament) {
      return { success: false, error: tErr?.message || 'Tournament not found' };
    }

    // Determine games_to_win: tournament override or game type default
    const gamesToWin = tournament.games_to_win_override || tournament.game_type.default_games_to_win;

    // Step 2: Load all checked-in players
    const { data: tournamentPlayers, error: tpErr } = await supabase
      .from('tournament_players')
      .select('*, player:players(*)')
      .eq('tournament_id', tournamentId);

    if (tpErr) return { success: false, error: tpErr.message };

    // Minimum 6 players for the new bracket structure
    if (!tournamentPlayers || tournamentPlayers.length < 6) {
      return {
        success: false,
        error: 'A minimum of 6 checked-in players is required to generate a bracket',
      };
    }

    // Step 3: Clear any existing bracket (in case of regeneration)
    await supabase.from('matches').delete().eq('tournament_id', tournamentId);

    // Step 4: Generate the bracket structure in memory
    const players = tournamentPlayers.map((tp) => ({
      id: tp.player.id,
      name: tp.player.name,
    }));
    const { matches, seedAssignments } = generateDoubleEliminationBracket(
      players,
      gamesToWin,
      topSeedPlayerId
    );

    // Step 5: Update seeds on tournament_players
    for (const assignment of seedAssignments) {
      await supabase
        .from('tournament_players')
        .update({ seed: assignment.seed })
        .eq('tournament_id', tournamentId)
        .eq('player_id', assignment.player_id);
    }

    // Step 6: Insert matches in two passes:
    //   Pass 1: insert all matches without their next_match_*_id pointers
    //           (so we get real DB UUIDs assigned)
    //   Pass 2: update each match with the correct UUIDs based on tempId mapping
    //
    // We skip inserting match_number for LB byes because they're not played.
    // BracketDisplay handles their absence gracefully via is_lb_bye detection.
    const matchesToInsert = matches.map((m) => ({
      tournament_id: tournamentId,
      bracket: m.bracket,
      round: m.round,
      // match_number may be null/undefined for LB byes; that's fine
      match_number: m.match_number || null,
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      winner_id: m.winner_id || null,
      games_to_win: m.games_to_win,
      status: m.status,
      // next_match_*_id pointers come in pass 2
    }));

    const { data: insertedMatches, error: insErr } = await supabase
      .from('matches')
      .insert(matchesToInsert)
      .select();

    if (insErr) return { success: false, error: insErr.message };

    // Build a map: tempId -> real DB id
    // The insertedMatches come back in the same order we inserted them
    const tempIdToDbId = {};
    for (let i = 0; i < matches.length; i++) {
      tempIdToDbId[matches[i].tempId] = insertedMatches[i].id;
    }

    // Pass 2: update pointers
    const updates = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const dbId = insertedMatches[i].id;

      if (m.next_match_winner_id || m.next_match_loser_id) {
        updates.push(
          supabase
            .from('matches')
            .update({
              next_match_winner_id: m.next_match_winner_id
                ? tempIdToDbId[m.next_match_winner_id]
                : null,
              next_match_winner_slot: m.next_match_winner_slot,
              next_match_loser_id: m.next_match_loser_id
                ? tempIdToDbId[m.next_match_loser_id]
                : null,
              next_match_loser_slot: m.next_match_loser_slot,
            })
            .eq('id', dbId)
        );
      }
    }
    await Promise.all(updates);

    // Step 7: Mark tournament as in_progress
    await supabase
      .from('tournaments')
      .update({ status: 'in_progress' })
      .eq('id', tournamentId);

    return { success: true };
  } catch (err) {
    console.error('Bracket generation failed:', err);
    return { success: false, error: err.message };
  }
}


// =============================================================================
// LB BYE DETECTION (runtime)
// =============================================================================

/**
 * Determine whether a given match is an LB bye (single-feeder LB match).
 *
 * We detect this by counting how many matches in the same tournament point
 * INTO this match (via next_match_winner_id or next_match_loser_id). If
 * only one match points in, it's a bye.
 *
 * Returns true only for losers-bracket matches; WB matches and grand finals
 * are never byes (in the new bracket structure).
 *
 * @param {Object} match - The match record (must have id, bracket, tournament_id)
 * @returns {Promise<boolean>}
 */
async function isLbByeMatch(match) {
  if (match.bracket !== 'losers') return false;

  // Count matches pointing into this one
  const { count: winnerFeeders } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', match.tournament_id)
    .eq('next_match_winner_id', match.id);

  const { count: loserFeeders } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', match.tournament_id)
    .eq('next_match_loser_id', match.id);

  const totalFeeders = (winnerFeeders || 0) + (loserFeeders || 0);
  return totalFeeders === 1;
}


// =============================================================================
// RECORDING GAME RESULTS
// =============================================================================

/**
 * Record a single game's winner within a match. Updates the match score and,
 * if a player has won enough games, marks the match complete and advances
 * the winner / drops the loser.
 *
 * @param {string} matchId - The match UUID
 * @param {string} winnerId - The player UUID who won this game
 * @returns {Promise<{success: boolean, error?: string, matchCompleted?: boolean}>}
 */
export async function recordGameResult(matchId, winnerId) {
  try {
    // Load the match
    const { data: match, error: mErr } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (mErr || !match) return { success: false, error: 'Match not found' };

    if (match.status === 'completed') {
      return { success: false, error: 'Match is already completed' };
    }

    if (winnerId !== match.player1_id && winnerId !== match.player2_id) {
      return { success: false, error: 'Winner must be one of the two match players' };
    }

    // Determine which game number this is (1-indexed)
    const { count: existingGames } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('match_id', matchId);

    const gameNumber = (existingGames || 0) + 1;

    // Insert the game record
    const { error: gErr } = await supabase
      .from('games')
      .insert({
        match_id: matchId,
        game_number: gameNumber,
        winner_id: winnerId,
      });

    if (gErr) return { success: false, error: gErr.message };

    // Update match score
    const newP1Score = winnerId === match.player1_id ? match.player1_score + 1 : match.player1_score;
    const newP2Score = winnerId === match.player2_id ? match.player2_score + 1 : match.player2_score;

    // Check if match is now complete (either player has hit games_to_win)
    const matchComplete =
      newP1Score >= match.games_to_win || newP2Score >= match.games_to_win;
    const matchWinnerId = matchComplete
      ? newP1Score >= match.games_to_win
        ? match.player1_id
        : match.player2_id
      : null;
    const matchLoserId = matchComplete
      ? matchWinnerId === match.player1_id
        ? match.player2_id
        : match.player1_id
      : null;

    // Update the match
    const updateData = {
      player1_score: newP1Score,
      player2_score: newP2Score,
      status: matchComplete ? 'completed' : 'in_progress',
    };
    if (matchComplete) {
      updateData.winner_id = matchWinnerId;
      updateData.completed_at = new Date().toISOString();
    }

    const { error: uErr } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', matchId);

    if (uErr) return { success: false, error: uErr.message };

    // If match completed, advance winner and drop loser
    if (matchComplete) {
      await advanceFromMatch(match, matchWinnerId, matchLoserId);

      // Check if the tournament is complete (grand final or grand final reset done)
      await checkTournamentCompletion(match.tournament_id);
    }

    return { success: true, matchCompleted: matchComplete };
  } catch (err) {
    console.error('Failed to record game result:', err);
    return { success: false, error: err.message };
  }
}


/**
 * After a match completes, push the winner to their next match and the loser
 * to their next match (or eliminate them).
 *
 * Special logic for grand final:
 *   - If WB winner (slot 1) wins, tournament is over
 *   - If LB winner (slot 2) wins, the loser (WB winner) goes to the bracket
 *     reset match. If the WB winner had not lost yet, the reset must happen.
 */
async function advanceFromMatch(match, winnerId, loserId) {
  // ---------------------------------------------------------------------------
  // Advance winner
  // ---------------------------------------------------------------------------
  if (match.next_match_winner_id) {
    await placePlayerInMatch(
      match.next_match_winner_id,
      winnerId,
      match.next_match_winner_slot
    );
  }

  // ---------------------------------------------------------------------------
  // Drop / eliminate loser
  // ---------------------------------------------------------------------------
  if (match.bracket === 'grand_final') {
    // Special case: in grand final, the WB winner is in slot 1 and the LB winner
    // is in slot 2. If the LB winner wins (slot 2 wins), we trigger the bracket
    // reset since the WB winner had not lost yet.
    const wbWinnerLost = loserId === match.player1_id;

    if (wbWinnerLost) {
      // Find the bracket reset match for this tournament
      const { data: resetMatch } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', match.tournament_id)
        .eq('bracket', 'grand_final_reset')
        .single();

      if (resetMatch) {
        // Both players advance to the reset match.
        // Loser of GF (the WB winner) becomes player 2,
        // Winner of GF (the LB winner) becomes player 1.
        await supabase
          .from('matches')
          .update({
            player1_id: winnerId,
            player2_id: loserId,
            status: 'ready',
          })
          .eq('id', resetMatch.id);
      }
    }
    // If WB winner won, tournament is over (no reset, no further advancement)
  } else if (match.next_match_loser_id) {
    await placePlayerInMatch(
      match.next_match_loser_id,
      loserId,
      match.next_match_loser_slot
    );
  }
  // Else loser is eliminated (LB matches and bye matches)
}


/**
 * Place a player into a specific slot of a match.
 *
 * Behaviors:
 *   - Sets player1_id or player2_id depending on slot
 *   - If both slots are now filled: marks status='ready'
 *   - If the target match is an LB bye (only one feeder pointing in):
 *     auto-completes it and advances the player to the next match
 *
 * The LB bye auto-advance is recursive in the rare case where one bye
 * leads directly into another bye.
 */
async function placePlayerInMatch(matchId, playerId, slot) {
  // Load the target match
  const { data: targetMatch } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (!targetMatch) return;

  // Detect LB bye: a losers-bracket match with only one feeder match pointing in
  const isBye = await isLbByeMatch(targetMatch);

  // -------------------------------------------------------------------------
  // LB BYE PATH: auto-advance the player without a game
  // -------------------------------------------------------------------------
  if (isBye) {
    // Mark the match as a bye, set the winner, and place the player.
    // We use slot=1 visually so the bye match always shows the player on top.
    await supabase
      .from('matches')
      .update({
        player1_id: playerId,
        player2_id: null,
        winner_id: playerId,
        status: 'bye',
        completed_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    // Recursively advance the bye-advanced player to the next match
    if (targetMatch.next_match_winner_id) {
      await placePlayerInMatch(
        targetMatch.next_match_winner_id,
        playerId,
        targetMatch.next_match_winner_slot
      );
    }
    return;
  }

  // -------------------------------------------------------------------------
  // NORMAL PATH: place the player and update status if both slots filled
  // -------------------------------------------------------------------------
  const updateData = {};
  if (slot === 1) updateData.player1_id = playerId;
  else updateData.player2_id = playerId;

  // Determine new status
  const newP1 = slot === 1 ? playerId : targetMatch.player1_id;
  const newP2 = slot === 2 ? playerId : targetMatch.player2_id;

  if (newP1 && newP2) {
    updateData.status = 'ready';
  }

  await supabase.from('matches').update(updateData).eq('id', matchId);
}


// =============================================================================
// TOURNAMENT COMPLETION & POINTS
// =============================================================================

/**
 * Check if all decisive matches are complete. If so, mark tournament complete
 * and award final placements and season points.
 */
async function checkTournamentCompletion(tournamentId) {
  // Load all matches for this tournament
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId);

  if (!matches) return;

  // Find the grand final and grand final reset
  const grandFinal = matches.find((m) => m.bracket === 'grand_final');
  const grandFinalReset = matches.find((m) => m.bracket === 'grand_final_reset');

  if (!grandFinal || grandFinal.status !== 'completed') return; // Not done yet

  // If grand final reset was triggered (both players assigned), it must also be complete
  if (grandFinalReset && grandFinalReset.player1_id && grandFinalReset.player2_id) {
    if (grandFinalReset.status !== 'completed') return; // Reset still in progress
  }

  // Tournament is complete. Determine the champion.
  const championId =
    grandFinalReset && grandFinalReset.winner_id
      ? grandFinalReset.winner_id
      : grandFinal.winner_id;

  // Award final placements and season points
  await awardFinalPlacements(tournamentId, matches, championId);

  // Mark tournament complete
  await supabase
    .from('tournaments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}


/**
 * Calculate each player's final placement and award them season points.
 *
 * Placement rules:
 *   1st: champion
 *   2nd: runner-up (loser of the final decisive grand final match)
 *   3rd: loser of LB final (the player who lost to the eventual LB winner in LB final)
 *   4th: loser of LB semi-final
 *   ...and so on, working backwards through the LB
 *
 * Win points: 1 point per match won (not counting bye auto-advances).
 */
async function awardFinalPlacements(tournamentId, matches, championId) {
  // Load all tournament players
  const { data: tournamentPlayers } = await supabase
    .from('tournament_players')
    .select('*')
    .eq('tournament_id', tournamentId);

  if (!tournamentPlayers) return;

  // Load placement points config
  const { data: placementConfig } = await supabase
    .from('placement_points_config')
    .select('*')
    .order('placement', { ascending: true });

  const placementPointsMap = {};
  if (placementConfig) {
    for (const row of placementConfig) {
      placementPointsMap[row.placement] = row.points;
    }
  }

  // Compute placements based on when each player was eliminated
  const placements = computePlacements(matches, tournamentPlayers, championId);

  // Compute win points: 1 per match won, EXCLUDING bye matches (status='bye')
  const winsByPlayer = {};
  for (const m of matches) {
    if (m.winner_id && m.status === 'completed') {
      // Only count actually-played matches, not byes
      winsByPlayer[m.winner_id] = (winsByPlayer[m.winner_id] || 0) + 1;
    }
  }

  // Update each tournament_players row
  for (const tp of tournamentPlayers) {
    const placement = placements[tp.player_id] || 0;
    const placementPoints = placementPointsMap[placement] || 0;
    const winPoints = winsByPlayer[tp.player_id] || 0;

    await supabase
      .from('tournament_players')
      .update({
        final_placement: placement,
        placement_points: placementPoints,
        win_points: winPoints,
      })
      .eq('id', tp.id);
  }
}


/**
 * Determine the final placement of each player based on when they were
 * eliminated. The later you got eliminated, the better your placement.
 *
 * Walk through the LB rounds in reverse order. The LB final loser gets 3rd,
 * the round before that gets 4th, etc. WB final loser placement depends on
 * whether they lost in the grand final or the bracket reset.
 *
 * Note: bye matches (status='bye') are skipped here because there's no real
 * loser in a bye match.
 */
function computePlacements(matches, tournamentPlayers, championId) {
  const placements = {};

  // 1st: champion
  placements[championId] = 1;

  // 2nd: runner-up (whoever the champion beat in the final decisive match)
  const grandFinal = matches.find((m) => m.bracket === 'grand_final');
  const grandFinalReset = matches.find((m) => m.bracket === 'grand_final_reset');

  let runnerUpId = null;
  if (grandFinalReset && grandFinalReset.winner_id) {
    // Reset was played; runner-up is the loser of the reset
    runnerUpId =
      grandFinalReset.winner_id === grandFinalReset.player1_id
        ? grandFinalReset.player2_id
        : grandFinalReset.player1_id;
  } else if (grandFinal && grandFinal.winner_id) {
    // No reset; runner-up is the loser of the grand final
    runnerUpId =
      grandFinal.winner_id === grandFinal.player1_id
        ? grandFinal.player2_id
        : grandFinal.player1_id;
  }

  if (runnerUpId) placements[runnerUpId] = 2;

  // 3rd, 4th, etc.: walk LB from final round backwards
  // The loser of the LB final gets 3rd, the loser of LB semis get 4th-tied, etc.
  // Skip byes since they don't have a meaningful loser.
  const lbMatches = matches
    .filter((m) =>
      m.bracket === 'losers' &&
      m.status === 'completed' && // excludes 'bye'
      m.player1_id &&
      m.player2_id // excludes byes that have only one player
    )
    .sort((a, b) => b.round - a.round); // Highest round first

  let currentPlacement = 3;
  let lastRound = null;

  for (const m of lbMatches) {
    if (m.round !== lastRound) {
      // New round, increment placement
      if (lastRound !== null) currentPlacement += 1;
      lastRound = m.round;
    }

    const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    if (loserId && !placements[loserId]) {
      placements[loserId] = currentPlacement;
    }
  }

  // Anyone left without a placement got eliminated in WB R1 with no LB win
  // Assign them the last available placement
  const allPlayerIds = tournamentPlayers.map((tp) => tp.player_id);
  const unplacedIds = allPlayerIds.filter((id) => !placements[id]);
  const lastPlacement = currentPlacement + 1;

  for (const id of unplacedIds) {
    placements[id] = lastPlacement;
  }

  return placements;
}


// =============================================================================
// ADMIN OVERRIDES
// =============================================================================

/**
 * Admin force-sets the winner of a match without recording individual games.
 * Useful when a player forfeits or there's a dispute resolution.
 *
 * This will also revert any subsequent matches that depended on this one,
 * since the original advancement may have been wrong.
 */
export async function adminForceWinner(matchId, winnerId, reason) {
  try {
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (!match) return { success: false, error: 'Match not found' };

    const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;

    // Revert any downstream advancement first (in case this is a re-decision)
    await revertDownstreamAdvancement(match);

    // Update the match
    const updateData = {
      winner_id: winnerId,
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    // Force the score to a finishing score
    if (winnerId === match.player1_id) {
      updateData.player1_score = match.games_to_win;
      updateData.player2_score = match.player2_score; // keep current
    } else {
      updateData.player2_score = match.games_to_win;
      updateData.player1_score = match.player1_score;
    }

    await supabase.from('matches').update(updateData).eq('id', matchId);

    // Now advance with the new winner
    await advanceFromMatch({ ...match, ...updateData }, winnerId, loserId);

    // Log the override
    await logAuditAction({
      action: 'force_winner',
      description: reason || `Admin forced ${winnerId} as winner`,
      tournament_id: match.tournament_id,
      match_id: matchId,
    });

    // Re-check tournament completion (might be done now, or might no longer be done)
    await checkTournamentCompletion(match.tournament_id);

    return { success: true };
  } catch (err) {
    console.error('Force winner failed:', err);
    return { success: false, error: err.message };
  }
}


/**
 * Undo the result of a completed match. Resets it to "ready" and reverts
 * downstream matches that may have been affected.
 *
 * Note: undoing a bye match is supported but generally shouldn't be needed
 * since byes are auto-advanced based on upstream results. If you undo the
 * upstream match, this function gets called recursively for the bye via
 * revertDownstreamAdvancement.
 */
export async function adminUndoMatch(matchId, reason) {
  try {
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (!match) return { success: false, error: 'Match not found' };

    // Revert downstream
    await revertDownstreamAdvancement(match);

    // Delete game records for this match
    await supabase.from('games').delete().eq('match_id', matchId);

    // Reset the match. For byes, also clear the auto-placed player.
    const wasBye = match.status === 'bye';
    const updateData = {
      winner_id: null,
      player1_score: 0,
      player2_score: 0,
      completed_at: null,
    };
    if (wasBye) {
      // Bye match: clear the auto-placed player, set status back to pending
      updateData.player1_id = null;
      updateData.player2_id = null;
      updateData.status = 'pending';
    } else {
      // Normal match: keep the players, set status based on whether both slots are filled
      updateData.status = match.player1_id && match.player2_id ? 'ready' : 'pending';
    }

    await supabase.from('matches').update(updateData).eq('id', matchId);

    await logAuditAction({
      action: 'undo_match',
      description: reason || 'Admin undid match result',
      tournament_id: match.tournament_id,
      match_id: matchId,
    });

    // Tournament may need to revert from completed status
    if (match.bracket === 'grand_final' || match.bracket === 'grand_final_reset') {
      await supabase
        .from('tournaments')
        .update({ status: 'in_progress', completed_at: null })
        .eq('id', match.tournament_id);
    }

    return { success: true };
  } catch (err) {
    console.error('Undo match failed:', err);
    return { success: false, error: err.message };
  }
}


/**
 * When we undo or change a match result, any downstream matches that the
 * winner/loser had been pushed into need to be cleared and reset.
 *
 * Special handling: if the downstream match is an LB bye that was auto-
 * advanced, we recursively undo its advancement too.
 */
async function revertDownstreamAdvancement(match) {
  if (!match.winner_id) return; // Match was never completed; nothing to revert

  // Clear winner from next_match_winner
  if (match.next_match_winner_id) {
    const { data: nextMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match.next_match_winner_id)
      .single();

    if (nextMatch) {
      // If the next match has been played or auto-resolved as a bye, recursively undo it
      if (nextMatch.status === 'completed' || nextMatch.status === 'bye') {
        await adminUndoMatch(nextMatch.id, 'Auto-reverted due to upstream change');
      }

      // Clear the slot the winner had been placed in
      const updateData = {};
      if (match.next_match_winner_slot === 1) updateData.player1_id = null;
      else updateData.player2_id = null;
      updateData.status = 'pending';

      await supabase.from('matches').update(updateData).eq('id', nextMatch.id);
    }
  }

  // Clear loser from next_match_loser
  if (match.next_match_loser_id) {
    const { data: nextMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match.next_match_loser_id)
      .single();

    if (nextMatch) {
      // If the next match has been played or auto-resolved as a bye, recursively undo it
      if (nextMatch.status === 'completed' || nextMatch.status === 'bye') {
        await adminUndoMatch(nextMatch.id, 'Auto-reverted due to upstream change');
      }

      const updateData = {};
      if (match.next_match_loser_slot === 1) updateData.player1_id = null;
      else updateData.player2_id = null;
      updateData.status = 'pending';

      await supabase.from('matches').update(updateData).eq('id', nextMatch.id);
    }
  }

  // Special case: grand final loser was placed in reset match
  if (match.bracket === 'grand_final') {
    const { data: resetMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', match.tournament_id)
      .eq('bracket', 'grand_final_reset')
      .single();

    if (resetMatch && (resetMatch.player1_id || resetMatch.player2_id)) {
      if (resetMatch.status === 'completed') {
        await adminUndoMatch(resetMatch.id, 'Auto-reverted due to grand final change');
      }
      await supabase
        .from('matches')
        .update({
          player1_id: null,
          player2_id: null,
          status: 'pending',
          player1_score: 0,
          player2_score: 0,
        })
        .eq('id', resetMatch.id);
    }
  }
}


/**
 * Swap the two players in a match. Used to fix admin errors.
 * Only allowed before the match has started.
 */
export async function adminSwapPlayers(matchId, reason) {
  try {
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (!match) return { success: false, error: 'Match not found' };
    if (match.status === 'completed' || match.status === 'in_progress' || match.status === 'bye') {
      return { success: false, error: 'Cannot swap players after the match has started' };
    }

    await supabase
      .from('matches')
      .update({
        player1_id: match.player2_id,
        player2_id: match.player1_id,
      })
      .eq('id', matchId);

    await logAuditAction({
      action: 'swap_players',
      description: reason || 'Admin swapped player positions',
      tournament_id: match.tournament_id,
      match_id: matchId,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}


// =============================================================================
// AUDIT LOGGING
// =============================================================================

async function logAuditAction({ action, description, tournament_id, match_id }) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('audit_log').insert({
    action,
    description,
    tournament_id,
    match_id,
    performed_by: user?.id,
  });
}
