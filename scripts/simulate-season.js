/**
 * SEASON SIMULATOR
 * =============================================================================
 *
 * Generates 6 weeks of fake tournament data and writes it directly to your
 * live Supabase database. After running, the data shows up on lit-darts.netlify.app
 * exactly as if you had run the tournaments by hand in the admin panel.
 *
 * WHAT IT DOES
 * ------------
 * For each of 6 Wednesdays starting 2026-05-06:
 *   1. Picks a random game type (rotates through all available games)
 *   2. Picks 8 to 16 random active players from your roster
 *   3. Optionally adds 1 to 3 walk-in players (60% chance)
 *   4. Creates the tournament row
 *   5. Checks players in (creates tournament_players rows)
 *   6. Generates the bracket using your real bracket.js logic
 *   7. Plays through every match using realistic random outcomes
 *      (strong players win 65% of the time vs average players)
 *   8. Records each individual game using your real recordGameResult() function
 *      so placements and season points are calculated by your live code
 *
 * STRONG PLAYERS
 * --------------
 * Players whose first name matches Jacob, Ryan, Kelly, Taylor, Scooter, or
 * Kevin (case-insensitive) win 65% of matches against average players.
 * Strong vs strong = 50/50. Average vs average = 50/50.
 *
 * HOW TO USE
 * ----------
 * From your project root:
 *
 *   node scripts/simulate-season.js
 *
 * Make sure .env.local has SUPABASE_URL and SUPABASE_SERVICE_KEY set first.
 *
 * HOW TO UNDO
 * -----------
 * In the Supabase SQL Editor, run:
 *
 *   DELETE FROM tournaments;
 *
 * That cascades through tournament_players, matches, and games. Walk-in
 * players will remain in the players table (they don't cascade), but they
 * are tagged with is_roster=false and named "Walk-in <FirstName>" so they
 * are easy to identify and bulk-delete with:
 *
 *   DELETE FROM players WHERE is_roster = false AND name LIKE 'Walk-in %';
 *
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { generateDoubleEliminationBracket } from '../src/lib/bracket.js';

// -----------------------------------------------------------------------------
// SETUP: load .env.local manually so we don't need a third-party dotenv package
// -----------------------------------------------------------------------------
// We parse the file ourselves instead of pulling in the `dotenv` package because
// adding a new dependency for one tiny file is overkill.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function loadEnv() {
  try {
    const envPath = join(projectRoot, '.env.local');
    const contents = readFileSync(envPath, 'utf-8');
    for (const line of contents.split('\n')) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Split on first = only (in case the value contains =)
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;

      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      // Strip surrounding quotes if present
      const unquoted = value.replace(/^["']|["']$/g, '');
      process.env[key] = unquoted;
    }
  } catch (err) {
    console.error('Could not read .env.local:', err.message);
    console.error('Make sure .env.local exists in your project root with:');
    console.error('  SUPABASE_URL=https://your-project.supabase.co');
    console.error('  SUPABASE_SERVICE_KEY=your_secret_key_here');
    process.exit(1);
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}

// Create the Supabase client with the service-role secret key.
// This bypasses RLS so we can write tournament data without being logged in.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});


// =============================================================================
// CONFIGURATION
// =============================================================================

// First Wednesday of the simulated season
const SEASON_START_DATE = '2026-05-06';
const NUMBER_OF_TOURNAMENTS = 6;

// Min and max players per night (drawn from active roster)
const MIN_ROSTER_ATTENDEES = 8;
const MAX_ROSTER_ATTENDEES = 16;

// Walk-in chance per tournament and how many to add when triggered
const WALK_IN_CHANCE = 0.6;
const MIN_WALK_INS = 1;
const MAX_WALK_INS = 3;

// First names of strong players. Match is case-insensitive on the first name only,
// so "Jacob Smith" or "Jake Smith" (no, only Jacob since it's the literal first name)
// will count, but "Jake" would not. Adjust here if needed.
const STRONG_PLAYER_FIRST_NAMES = ['jacob', 'ryan', 'kelly', 'taylor', 'scooter', 'kevin'];

// Win probability for strong vs average matchup
const STRONG_VS_AVERAGE_WIN_RATE = 0.65;

// Pool of fictional first names for walk-ins
const WALK_IN_NAME_POOL = [
  'Mike', 'Sarah', 'Jenny', 'Carlos', 'Pat', 'Dani', 'Alex', 'Bobby',
  'Casey', 'Drew', 'Frankie', 'Jamie', 'Lou', 'Morgan', 'Quinn', 'Sam',
  'Tony', 'Val', 'Whitney', 'Zoe',
];


// =============================================================================
// HELPERS
// =============================================================================

/**
 * Random integer between min and max inclusive.
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array.
 */
function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Fisher-Yates shuffle, returns a new array.
 */
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Add `daysToAdd` days to a YYYY-MM-DD date string and return the new YYYY-MM-DD.
 * We work in UTC to avoid any timezone weirdness around midnight.
 */
function addDays(dateString, daysToAdd) {
  const d = new Date(dateString + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return d.toISOString().split('T')[0];
}

/**
 * Decide whether a player counts as "strong" based on their first name.
 */
function isStrongPlayer(player) {
  if (!player || !player.name) return false;
  const firstName = player.name.trim().split(/\s+/)[0].toLowerCase();
  return STRONG_PLAYER_FIRST_NAMES.includes(firstName);
}

/**
 * Pick the winner of a single game between two players based on their
 * "strong" status. Strong vs average = 65/35 in favor of strong.
 * Strong vs strong or average vs average = 50/50.
 *
 * Returns the winning player object.
 */
function pickGameWinner(playerA, playerB) {
  const aStrong = isStrongPlayer(playerA);
  const bStrong = isStrongPlayer(playerB);

  // Equal tier matchup: coin flip
  if (aStrong === bStrong) {
    return Math.random() < 0.5 ? playerA : playerB;
  }

  // Mixed tier: strong wins 65% of the time
  const strongPlayer = aStrong ? playerA : playerB;
  const weakPlayer = aStrong ? playerB : playerA;
  return Math.random() < STRONG_VS_AVERAGE_WIN_RATE ? strongPlayer : weakPlayer;
}

/**
 * Pretty-prints a step heading to the console for readability.
 */
function logStep(message) {
  console.log(`\n  ${message}`);
}


// =============================================================================
// DATABASE READERS
// =============================================================================

/**
 * Load all active roster players from the database.
 * We need at least MIN_ROSTER_ATTENDEES of these to run any tournament.
 */
async function loadActiveRosterPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('id, name')
    .eq('is_active', true)
    .eq('is_roster', true);

  if (error) {
    throw new Error(`Failed to load players: ${error.message}`);
  }
  return data || [];
}

/**
 * Load all available game types so we can rotate through them.
 */
async function loadGameTypes() {
  const { data, error } = await supabase
    .from('game_types')
    .select('id, name, default_games_to_win')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to load game types: ${error.message}`);
  }
  return data || [];
}


// =============================================================================
// WALK-IN GENERATION
// =============================================================================

/**
 * Insert a fresh walk-in player row and return the new player object.
 * Names are formatted "Walk-in <FirstName>" so they're easy to identify and
 * bulk-delete later. Marked is_roster=false so they don't pollute the regular
 * roster but is_active=true so they show up in season standings.
 */
async function createWalkInPlayer(suffix) {
  const firstName = randPick(WALK_IN_NAME_POOL);
  const name = `Walk-in ${firstName} ${suffix}`;

  const { data, error } = await supabase
    .from('players')
    .insert({
      name,
      is_roster: false,
      is_active: true,
    })
    .select('id, name')
    .single();

  if (error) {
    throw new Error(`Failed to insert walk-in: ${error.message}`);
  }
  return data;
}


// =============================================================================
// BRACKET PERSISTENCE
// =============================================================================
// This is a port of generateAndSaveBracket() from src/lib/bracketDb.js.
// We can't import that file directly because it imports src/lib/supabase.js
// which is configured for the browser anon key. Our service-role client lives
// here instead, so we re-implement just the bracket save logic locally.

/**
 * Save a freshly generated bracket to the database for a given tournament.
 * Same logic as your live admin code, just using our service-role client.
 */
async function saveBracketToDatabase(tournamentId, gamesToWin) {
  // Load checked-in players
  const { data: tournamentPlayers, error: tpErr } = await supabase
    .from('tournament_players')
    .select('*, player:players(*)')
    .eq('tournament_id', tournamentId);
  if (tpErr) throw new Error(tpErr.message);

  if (!tournamentPlayers || tournamentPlayers.length < 6) {
    throw new Error('A minimum of 6 checked-in players is required');
  }

  // Clear any existing bracket for this tournament (defensive, should be empty)
  await supabase.from('matches').delete().eq('tournament_id', tournamentId);

  // Generate the bracket structure in memory using your real algorithm
  const players = tournamentPlayers.map((tp) => ({
    id: tp.player.id,
    name: tp.player.name,
  }));
  const { matches, seedAssignments } = generateDoubleEliminationBracket(
    players,
    gamesToWin
  );

  // Update seeds on tournament_players
  for (const assignment of seedAssignments) {
    await supabase
      .from('tournament_players')
      .update({ seed: assignment.seed })
      .eq('tournament_id', tournamentId)
      .eq('player_id', assignment.player_id);
  }

  // Insert matches in two passes:
  //   Pass 1: insert without next_match_*_id so we get back DB UUIDs
  //   Pass 2: update each match with the correct UUIDs
  const matchesToInsert = matches.map((m) => ({
    tournament_id: tournamentId,
    bracket: m.bracket,
    round: m.round,
    match_number: m.match_number || null,
    player1_id: m.player1_id,
    player2_id: m.player2_id,
    winner_id: m.winner_id || null,
    games_to_win: m.games_to_win,
    status: m.status,
  }));

  const { data: insertedMatches, error: insErr } = await supabase
    .from('matches')
    .insert(matchesToInsert)
    .select();
  if (insErr) throw new Error(insErr.message);

  // Build a map from temp ID (m1, m2, ...) to real DB UUIDs.
  // Inserted rows come back in the same order we inserted them.
  const tempIdToDbId = {};
  for (let i = 0; i < matches.length; i++) {
    tempIdToDbId[matches[i].tempId] = insertedMatches[i].id;
  }

  // Pass 2: rewrite next_match_*_id pointers with real UUIDs
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

  // Mark tournament as in_progress, ready for matches to be played
  await supabase
    .from('tournaments')
    .update({ status: 'in_progress' })
    .eq('id', tournamentId);
}


// =============================================================================
// MATCH PLAYBACK
// =============================================================================
// Once the bracket is saved, we keep polling for any match in 'ready' status
// and play it (record game results) until no more ready matches exist.
// This mirrors what would happen if a real admin sat there entering scores.

/**
 * Detect if a losers-bracket match is a single-feeder LB bye.
 * Same logic as isLbByeMatch() in your live bracketDb.js.
 */
async function isLbBye(match) {
  if (match.bracket !== 'losers') return false;

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

  return ((winnerFeeders || 0) + (loserFeeders || 0)) === 1;
}

/**
 * Place a player into a target match. If the target is an LB bye, mark it as
 * a bye and recursively advance the player. Mirrors placePlayerInMatch() from
 * your live code.
 */
async function placePlayerInMatch(matchId, playerId, slot) {
  const { data: targetMatch } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();
  if (!targetMatch) return;

  const isBye = await isLbBye(targetMatch);

  if (isBye) {
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

    if (targetMatch.next_match_winner_id) {
      await placePlayerInMatch(
        targetMatch.next_match_winner_id,
        playerId,
        targetMatch.next_match_winner_slot
      );
    }
    return;
  }

  // Normal placement
  const updateData = {};
  if (slot === 1) updateData.player1_id = playerId;
  else updateData.player2_id = playerId;

  const newP1 = slot === 1 ? playerId : targetMatch.player1_id;
  const newP2 = slot === 2 ? playerId : targetMatch.player2_id;
  if (newP1 && newP2) updateData.status = 'ready';

  await supabase.from('matches').update(updateData).eq('id', matchId);
}

/**
 * Push the winner and loser of a completed match to their next matches.
 * Mirrors advanceFromMatch() from your live code.
 */
async function advanceFromMatch(match, winnerId, loserId) {
  // Advance the winner
  if (match.next_match_winner_id) {
    await placePlayerInMatch(
      match.next_match_winner_id,
      winnerId,
      match.next_match_winner_slot
    );
  }

  // Special case: grand final
  if (match.bracket === 'grand_final') {
    const wbWinnerLost = loserId === match.player1_id;

    if (wbWinnerLost) {
      // Trigger the bracket reset: both players advance to the reset match
      const { data: resetMatch } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', match.tournament_id)
        .eq('bracket', 'grand_final_reset')
        .single();

      if (resetMatch) {
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
  } else if (match.next_match_loser_id) {
    // Drop the loser into their LB destination
    await placePlayerInMatch(
      match.next_match_loser_id,
      loserId,
      match.next_match_loser_slot
    );
  }
}

/**
 * Play one match to completion. Returns when the match is fully decided.
 * Records each individual game in the games table and updates the match
 * row's score and status as we go, just like a real admin would.
 */
async function playMatchToCompletion(match, playerLookup) {
  const player1 = playerLookup[match.player1_id];
  const player2 = playerLookup[match.player2_id];
  if (!player1 || !player2) {
    throw new Error(`Match ${match.id} has missing players`);
  }

  let p1Score = 0;
  let p2Score = 0;
  let gameNumber = 0;

  // Play games until one player hits games_to_win
  while (p1Score < match.games_to_win && p2Score < match.games_to_win) {
    gameNumber++;
    const gameWinner = pickGameWinner(player1, player2);

    // Insert game record
    await supabase
      .from('games')
      .insert({
        match_id: match.id,
        game_number: gameNumber,
        winner_id: gameWinner.id,
      });

    if (gameWinner.id === player1.id) p1Score++;
    else p2Score++;
  }

  // Mark match complete with final score and winner
  const matchWinnerId = p1Score > p2Score ? player1.id : player2.id;
  const matchLoserId = matchWinnerId === player1.id ? player2.id : player1.id;

  await supabase
    .from('matches')
    .update({
      player1_score: p1Score,
      player2_score: p2Score,
      winner_id: matchWinnerId,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', match.id);

  // Advance winner and loser to their next matches
  // We need the latest match data with all the next_match_*_id pointers
  const { data: refreshedMatch } = await supabase
    .from('matches')
    .select('*')
    .eq('id', match.id)
    .single();

  await advanceFromMatch(refreshedMatch, matchWinnerId, matchLoserId);
}

/**
 * Play through every match in a tournament until the bracket is fully decided.
 * We loop fetching ready matches, play one at a time, and stop when no
 * matches are left in 'ready' status. Worst-case loop count is bounded by
 * the total match count, so a runaway loop can't happen.
 */
async function playTournament(tournamentId, allPlayers) {
  // Build a player lookup map for O(1) access during match playback
  const playerLookup = {};
  for (const p of allPlayers) playerLookup[p.id] = p;

  // Safety counter so a bug in advancement logic can't infinite-loop
  let safetyCounter = 0;
  const MAX_ITERATIONS = 500;

  while (safetyCounter++ < MAX_ITERATIONS) {
    // Find the next ready match (lowest match_number first to follow play order)
    const { data: readyMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('status', 'ready')
      .order('match_number', { ascending: true })
      .limit(1);

    if (!readyMatches || readyMatches.length === 0) break;

    const match = readyMatches[0];
    await playMatchToCompletion(match, playerLookup);
  }

  if (safetyCounter >= MAX_ITERATIONS) {
    throw new Error('Match playback exceeded max iterations (likely a bug)');
  }
}


// =============================================================================
// PLACEMENT AND POINTS AWARDING
// =============================================================================
// Once the grand final (and reset, if played) is complete, we calculate every
// player's final placement and award them win points + placement bonus points.
// This mirrors awardFinalPlacements() from your live bracketDb.js, ported to
// our service-role client.

/**
 * After the bracket is fully played, calculate placements and award points.
 */
async function finalizeTournament(tournamentId) {
  // Load all matches and players for this tournament
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId);

  const { data: tournamentPlayers } = await supabase
    .from('tournament_players')
    .select('*')
    .eq('tournament_id', tournamentId);

  // Load placement points config (5/3/2/1 for 1st through 4th by default)
  const { data: placementConfig } = await supabase
    .from('placement_points_config')
    .select('*');
  const placementPointsByPlace = {};
  for (const row of placementConfig || []) {
    placementPointsByPlace[row.placement] = row.points;
  }

  // Determine champion: winner of grand final reset if it was played, else GF winner
  const grandFinal = matches.find((m) => m.bracket === 'grand_final');
  const grandFinalReset = matches.find((m) => m.bracket === 'grand_final_reset');
  const championId =
    grandFinalReset && grandFinalReset.winner_id
      ? grandFinalReset.winner_id
      : grandFinal.winner_id;

  // Runner-up: loser of the deciding final
  const decidingFinal =
    grandFinalReset && grandFinalReset.winner_id ? grandFinalReset : grandFinal;
  const runnerUpId =
    decidingFinal.winner_id === decidingFinal.player1_id
      ? decidingFinal.player2_id
      : decidingFinal.player1_id;

  // Count win points: 1 per match won (excluding LB byes which auto-resolve)
  const winPointsByPlayer = {};
  for (const tp of tournamentPlayers) winPointsByPlayer[tp.player_id] = 0;
  for (const m of matches) {
    // LB byes have status='bye', not 'completed'; they don't count as a played win
    if (m.status === 'completed' && m.winner_id) {
      winPointsByPlayer[m.winner_id] = (winPointsByPlayer[m.winner_id] || 0) + 1;
    }
  }

  // Determine placements:
  //   1st = champion
  //   2nd = runner-up
  //   3rd = loser of LB final (the LB winner who lost the LB final, or the
  //         player who reached LB final and was eliminated there). LB final is
  //         the highest-round LB match.
  //   4th = loser of LB semifinal (highest-round LB match minus 1).
  //   Everyone else = ranked by elimination round in LB (later = higher placement)
  const lbMatches = matches.filter((m) => m.bracket === 'losers');
  const maxLbRound = lbMatches.length > 0 ? Math.max(...lbMatches.map((m) => m.round)) : 0;

  // LB final is the only match in the highest LB round. Its loser placed 3rd.
  const lbFinal = lbMatches.find((m) => m.round === maxLbRound);
  const thirdPlaceId = lbFinal
    ? (lbFinal.winner_id === lbFinal.player1_id ? lbFinal.player2_id : lbFinal.player1_id)
    : null;

  // LB semifinal (round before LB final). Whoever lost there placed 4th.
  // There may be one or two of these depending on bracket size; the loser of
  // the round before final is treated as 4th. If there are two losers in that
  // round (rare in this structure), we pick one arbitrarily.
  const lbSemifinals = lbMatches.filter((m) => m.round === maxLbRound - 1);
  let fourthPlaceId = null;
  for (const m of lbSemifinals) {
    if (m.status === 'completed' && m.winner_id) {
      fourthPlaceId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
      break;
    }
  }

  // Update each tournament_player row with their final stats
  for (const tp of tournamentPlayers) {
    let placement = null;
    if (tp.player_id === championId) placement = 1;
    else if (tp.player_id === runnerUpId) placement = 2;
    else if (tp.player_id === thirdPlaceId) placement = 3;
    else if (tp.player_id === fourthPlaceId) placement = 4;

    const placementPoints = placement ? (placementPointsByPlace[placement] || 0) : 0;
    const winPoints = winPointsByPlayer[tp.player_id] || 0;

    await supabase
      .from('tournament_players')
      .update({
        final_placement: placement,
        placement_points: placementPoints,
        win_points: winPoints,
      })
      .eq('id', tp.id);
  }

  // Mark tournament completed
  await supabase
    .from('tournaments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}


// =============================================================================
// SINGLE-TOURNAMENT ORCHESTRATION
// =============================================================================

/**
 * Run the full lifecycle for one tournament:
 *   1. Decide attendance and walk-ins
 *   2. Create the tournament row
 *   3. Check players in
 *   4. Generate and save the bracket
 *   5. Play through all matches
 *   6. Finalize placements and points
 */
async function simulateOneTournament({
  tournamentDate,
  weekNumber,
  rosterPlayers,
  gameType,
}) {
  console.log(`\n=== Week ${weekNumber}: ${tournamentDate} (${gameType.name}) ===`);

  // ---------------------------------------------------------------------------
  // Pick attendees
  // ---------------------------------------------------------------------------
  const attendanceCount = randInt(MIN_ROSTER_ATTENDEES, MAX_ROSTER_ATTENDEES);
  const cappedAttendance = Math.min(attendanceCount, rosterPlayers.length);
  const rosterAttendees = shuffle(rosterPlayers).slice(0, cappedAttendance);

  // Maybe add walk-ins
  const walkIns = [];
  if (Math.random() < WALK_IN_CHANCE) {
    const walkInCount = randInt(MIN_WALK_INS, MAX_WALK_INS);
    logStep(`Adding ${walkInCount} walk-in${walkInCount > 1 ? 's' : ''}`);
    for (let i = 0; i < walkInCount; i++) {
      // Suffix uses week number + index to keep names unique across the season
      const suffix = `W${weekNumber}-${i + 1}`;
      const walkIn = await createWalkInPlayer(suffix);
      walkIns.push(walkIn);
    }
  }

  const allAttendees = [...rosterAttendees, ...walkIns];
  console.log(`  Total attendees: ${allAttendees.length}`);

  // ---------------------------------------------------------------------------
  // Create tournament row
  // ---------------------------------------------------------------------------
  logStep('Creating tournament row');
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      tournament_date: tournamentDate,
      name: `Week ${weekNumber}: ${gameType.name}`,
      game_type_id: gameType.id,
      status: 'setup',
    })
    .select()
    .single();

  if (tErr) throw new Error(`Failed to create tournament: ${tErr.message}`);

  // ---------------------------------------------------------------------------
  // Check players in (insert tournament_players rows)
  // ---------------------------------------------------------------------------
  logStep('Checking players in');
  const tpRows = allAttendees.map((p) => ({
    tournament_id: tournament.id,
    player_id: p.id,
  }));
  const { error: tpErr } = await supabase.from('tournament_players').insert(tpRows);
  if (tpErr) throw new Error(`Failed to check players in: ${tpErr.message}`);

  // ---------------------------------------------------------------------------
  // Generate and save the bracket
  // ---------------------------------------------------------------------------
  logStep('Generating bracket');
  await saveBracketToDatabase(tournament.id, gameType.default_games_to_win);

  // ---------------------------------------------------------------------------
  // Play through all matches
  // ---------------------------------------------------------------------------
  logStep('Playing all matches');
  await playTournament(tournament.id, allAttendees);

  // ---------------------------------------------------------------------------
  // Finalize placements and award points
  // ---------------------------------------------------------------------------
  logStep('Finalizing placements and awarding points');
  await finalizeTournament(tournament.id);

  // Print a quick summary
  const { data: top4 } = await supabase
    .from('tournament_players')
    .select('final_placement, win_points, placement_points, player:players(name)')
    .eq('tournament_id', tournament.id)
    .not('final_placement', 'is', null)
    .order('final_placement', { ascending: true });

  if (top4 && top4.length > 0) {
    console.log('  Final placements:');
    for (const row of top4) {
      const totalPts = row.win_points + row.placement_points;
      console.log(
        `    ${row.final_placement}. ${row.player.name} ` +
        `(${row.win_points} win pts + ${row.placement_points} placement = ${totalPts})`
      );
    }
  }
}


// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('======================================================');
  console.log('   DART TOURNAMENT SEASON SIMULATOR');
  console.log('======================================================');
  console.log(`Season start: ${SEASON_START_DATE}`);
  console.log(`Tournaments to simulate: ${NUMBER_OF_TOURNAMENTS}`);
  console.log(`Strong players: ${STRONG_PLAYER_FIRST_NAMES.join(', ')}`);

  // Sanity check: load roster and game types up front
  console.log('\nLoading roster and game types...');
  const roster = await loadActiveRosterPlayers();
  const gameTypes = await loadGameTypes();

  console.log(`  ${roster.length} active roster players found`);
  console.log(`  ${gameTypes.length} game types found: ${gameTypes.map((g) => g.name).join(', ')}`);

  if (roster.length < MIN_ROSTER_ATTENDEES) {
    throw new Error(
      `Need at least ${MIN_ROSTER_ATTENDEES} active roster players to simulate. ` +
      `Found only ${roster.length}.`
    );
  }
  if (gameTypes.length === 0) {
    throw new Error('No active game types found. Run the seed migration first.');
  }

  // Shuffle the game types so each season feels different. We rotate through
  // them in shuffled order; if the season is longer than the game-type list,
  // we wrap around.
  const shuffledGameTypes = shuffle(gameTypes);

  // Simulate each Wednesday
  for (let week = 1; week <= NUMBER_OF_TOURNAMENTS; week++) {
    const tournamentDate = addDays(SEASON_START_DATE, (week - 1) * 7);
    const gameType = shuffledGameTypes[(week - 1) % shuffledGameTypes.length];

    await simulateOneTournament({
      tournamentDate,
      weekNumber: week,
      rosterPlayers: roster,
      gameType,
    });
  }

  console.log('\n======================================================');
  console.log('   SEASON SIMULATION COMPLETE');
  console.log('======================================================');
  console.log('\nAll tournaments are now visible at lit-darts.netlify.app');
  console.log('Season standings should populate automatically.\n');
}

main().catch((err) => {
  console.error('\nSimulation failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
