/**
 * DOUBLE-ELIMINATION BRACKET GENERATION (Stage 3 rewrite)
 * =============================================================================
 *
 * This module generates the structure of a double-elimination tournament
 * bracket given a list of players. The result is an array of "match" objects
 * ready to insert into the database, plus seed assignments for tournament_players.
 *
 * KEY DIFFERENCES FROM PREVIOUS VERSION
 * --------------------------------------
 *   1. BYE MODEL: bye players skip Round 1 entirely and start in Round 2,
 *      paired with a Round 1 winner. There are NO "real player vs BYE" matches
 *      in the bracket. If a slot would be a bye, it simply doesn't exist as a
 *      separate match.
 *
 *   2. PURE RANDOM PAIRINGS: Round 1 matchups are completely random shuffle.
 *      No standard 1-vs-N seeding. Seed numbers are assigned for display only.
 *
 *   3. RANDOM BYE ASSIGNMENT: bye recipients are chosen randomly from the
 *      player pool, not given to top seeds.
 *
 *   4. PLAY-ORDER MATCH NUMBERING: matches get numbered (1, 2, 3, ...) in
 *      a play-order-aware sequence that:
 *        - respects dependencies (a match can't be numbered before its feeders)
 *        - alternates between WB and LB when both have ready matches
 *        - tries to avoid scheduling the same player in consecutive matches
 *      The grand final reset is always last, and only counts if it's played.
 *
 *   5. MINIMUM 6 PLAYERS. Smaller fields are not supported by this generator.
 *      The check is enforced at the entry point.
 *
 * HOW DOUBLE ELIMINATION WORKS
 * ----------------------------
 * Two brackets run side by side:
 *   - Winner's Bracket (WB): standard single-elim, lose once and you drop to LB
 *   - Loser's Bracket (LB): lose here and you're out. LB has roughly twice
 *     as many rounds as WB because losers from each WB round get fed in on
 *     alternating rounds (drop rounds vs consolidation rounds).
 *
 * Then the Grand Final pairs the WB champion against the LB champion.
 * Because the WB champion has not lost yet, if the LB champion wins the
 * first grand final, a "bracket reset" match is played to give the WB
 * champion their first loss before being eliminated.
 *
 * MATCH LINKING
 * -------------
 * Each match has pointers (next_match_winner_id, next_match_loser_id) that
 * tell the runtime where to send the winner and loser when the match
 * completes. Bracket reset is special: it's only played if needed.
 *
 * IMPORTANT: this file uses TEMP STRING IDS (m1, m2, ...) to track the
 * linking relationships. The DB layer (bracketDb.js) is responsible for
 * inserting matches, getting back the real Postgres UUIDs, and rewriting
 * the next_match_*_id fields with the real UUIDs.
 * =============================================================================
 */


// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate a complete double-elimination bracket structure.
 *
 * @param {Array} players - Array of { id, name } objects. Minimum 6.
 * @param {number} gamesToWin - Games-to-win threshold per match (e.g., 2 for
 *                              best-of-3, 3 for best-of-5). Note: the grand
 *                              final and reset use this same value.
 * @returns {Object} {
 *   matches: array of match objects ready for DB insertion,
 *   seedAssignments: array of { player_id, seed } pairs
 * }
 */
export function generateDoubleEliminationBracket(players, gamesToWin = 2) {
  if (!players || players.length < 6) {
    throw new Error('A minimum of 6 players is required to generate a bracket');
  }

  // Reset temp ID counter so each generation starts fresh (m1, m2, ...)
  resetTempIdCounter();

  // -----------------------------------------------------------------------
  // Step 1: Random shuffle for seed assignment
  // -----------------------------------------------------------------------
  // Seeds are display-only labels. The shuffle is what produces the random
  // pairings for Round 1 (slots are filled in shuffled order).
  const shuffled = shuffleArray([...players]);
  const seedAssignments = shuffled.map((p, i) => ({
    player_id: p.id,
    seed: i + 1,
  }));
  // Annotate each player with their seed for use during structure building
  const seededPlayers = shuffled.map((p, i) => ({ ...p, seed: i + 1 }));

  // -----------------------------------------------------------------------
  // Step 2: Decide how many byes are needed and pick recipients randomly
  // -----------------------------------------------------------------------
  const bracketSize = nextPowerOfTwo(seededPlayers.length);
  const byeCount = bracketSize - seededPlayers.length;

  // The first `byeCount` players in the (already shuffled) list are byes.
  // This effectively makes bye assignment random because the list was shuffled.
  const byePlayers = seededPlayers.slice(0, byeCount);
  const r1Players = seededPlayers.slice(byeCount);

  // -----------------------------------------------------------------------
  // Step 3: Build the Winner's Bracket
  // -----------------------------------------------------------------------
  // R1: r1Players paired up two-at-a-time (no byes here)
  // R2: r1MatchCount winners + byeCount bye-recipients = bracketSize/2 slots
  //     filled across bracketSize/4 matches
  // R3+: standard halving
  const wb = buildWinnersBracket(r1Players, byePlayers, bracketSize, gamesToWin);

  // -----------------------------------------------------------------------
  // Step 4: Build the Loser's Bracket
  // -----------------------------------------------------------------------
  // LB structure depends on WB shape (specifically how many R1 matches there are)
  const lb = buildLosersBracket(wb, bracketSize, gamesToWin);

  // -----------------------------------------------------------------------
  // Step 5: Grand Final + Bracket Reset
  // -----------------------------------------------------------------------
  const finals = buildGrandFinal(wb, lb, gamesToWin);

  // -----------------------------------------------------------------------
  // Step 6: Combine all matches and assign play-order match numbers
  // -----------------------------------------------------------------------
  const allMatches = [...wb, ...lb, ...finals];
  assignPlayOrderNumbers(allMatches);

  // -----------------------------------------------------------------------
  // Step 7: Initialize match status flags based on player assignments
  // -----------------------------------------------------------------------
  // Matches with both player slots filled are 'ready'; otherwise 'pending'.
  // We OVERWRITE the status here even if it was set during construction,
  // because R2+ matches that get bye-recipients in both slots end up with
  // both players assigned but were initialized as 'pending' during build.
  // LB byes (single-feeder LB matches) stay 'pending'; the DB layer will
  // mark them 'bye' and auto-advance when the upstream match completes.
  for (const m of allMatches) {
    if (m.is_lb_bye) {
      m.status = 'pending';
      continue;
    }
    if (m.player1_id && m.player2_id) {
      m.status = 'ready';
    } else {
      m.status = 'pending';
    }
  }

  return {
    matches: allMatches,
    seedAssignments,
  };
}


// =============================================================================
// HELPERS: Shuffle and bracket math
// =============================================================================

/**
 * Fisher-Yates shuffle. Returns a NEW array; does not mutate input.
 */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Round up to next power of 2.
 *   6 -> 8, 8 -> 8, 9 -> 16, 15 -> 16, 16 -> 16, 17 -> 32
 */
function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}


// =============================================================================
// TEMP ID GENERATOR
// =============================================================================
// We need stable string IDs to wire up next_match_*_id pointers before the
// database has assigned real UUIDs. The DB layer rewrites these after insert.

let tempIdCounter = 0;
function nextTempId() {
  return `m${++tempIdCounter}`;
}
function resetTempIdCounter() {
  tempIdCounter = 0;
}


// =============================================================================
// WINNER'S BRACKET BUILDER
// =============================================================================

/**
 * Build the Winner's Bracket.
 *
 * Inputs:
 *   r1Players    - array of seeded players who play in WB R1 (length = r1Count*2)
 *   byePlayers   - array of seeded players who skip R1 (length = byeCount)
 *   bracketSize  - power of 2 (8, 16, 32, ...)
 *   gamesToWin   - games-to-win threshold
 *
 * Returns an array of match objects (all bracket='winners').
 */
function buildWinnersBracket(r1Players, byePlayers, bracketSize, gamesToWin) {
  const matches = [];
  const r1Count = r1Players.length / 2;
  const wbRoundCount = Math.log2(bracketSize);

  // Group matches by round for easier wiring
  const wbByRound = {};

  // ---------------------------------------------------------------------------
  // Round 1
  // ---------------------------------------------------------------------------
  // r1Players are already shuffled. Pair them up (slot 0,1), (2,3), etc.
  wbByRound[1] = [];
  for (let i = 0; i < r1Count; i++) {
    const m = {
      tempId: nextTempId(),
      bracket: 'winners',
      round: i === 0 ? 1 : 1, // always 1 here, kept for consistency
      position_in_round: i,
      player1_id: r1Players[2 * i].id,
      player2_id: r1Players[2 * i + 1].id,
      player1_score: 0,
      player2_score: 0,
      winner_id: null,
      status: 'ready', // both slots filled, ready to play
      games_to_win: gamesToWin,
      next_match_winner_id: null,
      next_match_winner_slot: null,
      next_match_loser_id: null,
      next_match_loser_slot: null,
    };
    wbByRound[1].push(m);
    matches.push(m);
  }

  // ---------------------------------------------------------------------------
  // Round 2 (where byes start playing)
  // ---------------------------------------------------------------------------
  // R2 has bracketSize/4 matches. Each match has two slots filled by either
  // an R1 winner or a bye-recipient.
  //
  // Strategy: distribute R1 winners and byes alternately so that bye-paired
  // matches and full-feeder matches are mixed (looks better visually and
  // means there's always something to play).
  if (wbRoundCount >= 2) {
    const r2Count = bracketSize / 4;
    wbByRound[2] = [];

    // Build list of "slot fillers" in order:
    //   r1Count slots come from R1 winners (referenced by feeder match)
    //   byeCount slots come from bye-recipients (player IDs directly)
    // Total = r1Count + byeCount = bracketSize / 2 = r2Count * 2 ✓
    //
    // We interleave: first slot of each R2 match is an R1 winner (when
    // available), second slot is the next bye player or another R1 winner.
    let r1Idx = 0;
    let byeIdx = 0;

    for (let i = 0; i < r2Count; i++) {
      const m = {
        tempId: nextTempId(),
        bracket: 'winners',
        round: 2,
        position_in_round: i,
        player1_id: null,
        player2_id: null,
        player1_score: 0,
        player2_score: 0,
        winner_id: null,
        status: 'pending',
        games_to_win: gamesToWin,
        next_match_winner_id: null,
        next_match_winner_slot: null,
        next_match_loser_id: null,
        next_match_loser_slot: null,
      };

      // Slot 1: prefer an R1 winner (so byes don't bunch into one match)
      if (r1Idx < r1Players.length / 2) {
        wbByRound[1][r1Idx].next_match_winner_id = m.tempId;
        wbByRound[1][r1Idx].next_match_winner_slot = 1;
        r1Idx++;
      } else if (byeIdx < byePlayers.length) {
        m.player1_id = byePlayers[byeIdx++].id;
      }

      // Slot 2: next R1 winner if available, else a bye
      if (r1Idx < r1Players.length / 2) {
        wbByRound[1][r1Idx].next_match_winner_id = m.tempId;
        wbByRound[1][r1Idx].next_match_winner_slot = 2;
        r1Idx++;
      } else if (byeIdx < byePlayers.length) {
        m.player2_id = byePlayers[byeIdx++].id;
      }

      wbByRound[2].push(m);
      matches.push(m);
    }
  }

  // ---------------------------------------------------------------------------
  // Rounds 3+ (no byes; just paired feeders)
  // ---------------------------------------------------------------------------
  for (let r = 3; r <= wbRoundCount; r++) {
    wbByRound[r] = [];
    const matchCount = bracketSize / Math.pow(2, r);

    for (let i = 0; i < matchCount; i++) {
      const m = {
        tempId: nextTempId(),
        bracket: 'winners',
        round: r,
        position_in_round: i,
        player1_id: null,
        player2_id: null,
        player1_score: 0,
        player2_score: 0,
        winner_id: null,
        status: 'pending',
        games_to_win: gamesToWin,
        next_match_winner_id: null,
        next_match_winner_slot: null,
        next_match_loser_id: null,
        next_match_loser_slot: null,
      };

      // Two feeders from the previous round (matches at positions 2i and 2i+1)
      const prev = wbByRound[r - 1];
      prev[2 * i].next_match_winner_id = m.tempId;
      prev[2 * i].next_match_winner_slot = 1;
      prev[2 * i + 1].next_match_winner_id = m.tempId;
      prev[2 * i + 1].next_match_winner_slot = 2;

      wbByRound[r].push(m);
      matches.push(m);
    }
  }

  return matches;
}


// =============================================================================
// LOSER'S BRACKET BUILDER
// =============================================================================

/**
 * Build the Loser's Bracket.
 *
 * Standard double-elim LB pattern:
 *   LB R1:           pairs of WB R1 losers (no LB feeders)
 *   LB R2 (drop):    LB R1 winners + WB R2 losers
 *   LB R3 (consol):  LB R2 winners only
 *   LB R4 (drop):    LB R3 winners + WB R3 losers
 *   ...
 *
 * If WB R1 has an odd number of matches, LB R1 will have one match with
 * only one feeder (a single-feeder bye that auto-advances). This is acceptable
 * per our rule: it's still a real player auto-advancing, not a phantom match.
 *
 * Returns an array of match objects (all bracket='losers').
 */
function buildLosersBracket(wbMatches, bracketSize, gamesToWin) {
  const matches = [];
  const wbRoundCount = Math.log2(bracketSize);
  if (wbRoundCount < 2) return matches;

  // Group WB matches by round for lookup
  const wbByRound = {};
  for (const m of wbMatches) {
    if (!wbByRound[m.round]) wbByRound[m.round] = [];
    wbByRound[m.round].push(m);
  }

  const lbByRound = {};
  const lbRoundCount = (wbRoundCount - 1) * 2;

  // ---------------------------------------------------------------------------
  // LB Round 1: pair up WB R1 losers
  // ---------------------------------------------------------------------------
  const wbR1 = wbByRound[1] || [];
  const lbR1Count = Math.ceil(wbR1.length / 2);
  lbByRound[1] = [];

  for (let i = 0; i < lbR1Count; i++) {
    const m = {
      tempId: nextTempId(),
      bracket: 'losers',
      round: 1,
      position_in_round: i,
      player1_id: null,
      player2_id: null,
      player1_score: 0,
      player2_score: 0,
      winner_id: null,
      status: 'pending',
      games_to_win: gamesToWin,
      next_match_winner_id: null,
      next_match_winner_slot: null,
      next_match_loser_id: null,
      next_match_loser_slot: null,
      // Mark single-feeder matches so the DB layer knows to auto-advance
      // when the lone feeder completes.
      is_lb_bye: false,
    };

    // Wire WB R1 losers as feeders
    if (wbR1[2 * i]) {
      wbR1[2 * i].next_match_loser_id = m.tempId;
      wbR1[2 * i].next_match_loser_slot = 1;
    }
    if (wbR1[2 * i + 1]) {
      wbR1[2 * i + 1].next_match_loser_id = m.tempId;
      wbR1[2 * i + 1].next_match_loser_slot = 2;
    } else {
      // Odd WB R1 count: this LB R1 match has only one feeder
      m.is_lb_bye = true;
    }

    lbByRound[1].push(m);
    matches.push(m);
  }

  // ---------------------------------------------------------------------------
  // LB Rounds 2+
  // ---------------------------------------------------------------------------
  for (let r = 2; r <= lbRoundCount; r++) {
    const isDropRound = r % 2 === 0;
    const correspondingWbRound = isDropRound ? r / 2 + 1 : null;
    const prevLb = lbByRound[r - 1] || [];
    let matchCount;

    if (isDropRound) {
      // Drop round: each prev LB winner pairs with one WB round-N loser.
      // Match count = number of LB R(r-1) matches = number of WB R(r/2+1) matches.
      // These should match, but with odd WB R1 counts we may get a mismatch
      // that we handle as a single-feeder match.
      const wbDropCount = (wbByRound[correspondingWbRound] || []).length;
      matchCount = Math.max(prevLb.length, wbDropCount);
    } else {
      // Consolidation round: half as many matches as previous (rounding up
      // for odd counts, which produces a single-feeder match)
      matchCount = Math.ceil(prevLb.length / 2);
    }

    lbByRound[r] = [];
    for (let i = 0; i < matchCount; i++) {
      const m = {
        tempId: nextTempId(),
        bracket: 'losers',
        round: r,
        position_in_round: i,
        player1_id: null,
        player2_id: null,
        player1_score: 0,
        player2_score: 0,
        winner_id: null,
        status: 'pending',
        games_to_win: gamesToWin,
        next_match_winner_id: null,
        next_match_winner_slot: null,
        next_match_loser_id: null,
        next_match_loser_slot: null,
        is_lb_bye: false,
      };

      let feederCount = 0;

      if (isDropRound) {
        // Slot 1: previous LB round's winner
        if (prevLb[i]) {
          prevLb[i].next_match_winner_id = m.tempId;
          prevLb[i].next_match_winner_slot = 1;
          feederCount++;
        }
        // Slot 2: corresponding WB round's loser
        const wbDropMatches = wbByRound[correspondingWbRound] || [];
        if (wbDropMatches[i]) {
          wbDropMatches[i].next_match_loser_id = m.tempId;
          wbDropMatches[i].next_match_loser_slot = 2;
          feederCount++;
        }
      } else {
        // Consolidation: pair two prev LB winners
        if (prevLb[2 * i]) {
          prevLb[2 * i].next_match_winner_id = m.tempId;
          prevLb[2 * i].next_match_winner_slot = 1;
          feederCount++;
        }
        if (prevLb[2 * i + 1]) {
          prevLb[2 * i + 1].next_match_winner_id = m.tempId;
          prevLb[2 * i + 1].next_match_winner_slot = 2;
          feederCount++;
        }
      }

      // Single-feeder = LB bye (one player auto-advances)
      if (feederCount === 1) m.is_lb_bye = true;

      lbByRound[r].push(m);
      matches.push(m);
    }
  }

  return matches;
}


// =============================================================================
// GRAND FINAL + BRACKET RESET
// =============================================================================

/**
 * Build the grand final and bracket reset matches and wire them up.
 */
function buildGrandFinal(wbMatches, lbMatches, gamesToWin) {
  // Find WB final and LB final
  const wbFinal = wbMatches.find(
    (m) => m.bracket === 'winners' &&
      !m.next_match_winner_id // final has no next match in WB
  );
  const lbFinal = lbMatches.find(
    (m) => m.bracket === 'losers' &&
      !m.next_match_winner_id // final has no next match in LB
  );

  if (!wbFinal || !lbFinal) {
    throw new Error('Could not locate WB final or LB final to wire grand final');
  }

  const matches = [];

  // Grand Final
  const gf = {
    tempId: nextTempId(),
    bracket: 'grand_final',
    round: 1,
    position_in_round: 0,
    player1_id: null, // WB winner fills slot 1
    player2_id: null, // LB winner fills slot 2
    player1_score: 0,
    player2_score: 0,
    winner_id: null,
    status: 'pending',
    games_to_win: gamesToWin,
    next_match_winner_id: null,
    next_match_winner_slot: null,
    next_match_loser_id: null,
    next_match_loser_slot: null,
  };
  matches.push(gf);

  // Bracket Reset (only played if WB winner loses GF)
  const reset = {
    tempId: nextTempId(),
    bracket: 'grand_final_reset',
    round: 1,
    position_in_round: 0,
    player1_id: null,
    player2_id: null,
    player1_score: 0,
    player2_score: 0,
    winner_id: null,
    status: 'pending',
    games_to_win: gamesToWin,
    next_match_winner_id: null,
    next_match_winner_slot: null,
    next_match_loser_id: null,
    next_match_loser_slot: null,
  };
  matches.push(reset);

  // Wire WB final winner -> GF slot 1
  wbFinal.next_match_winner_id = gf.tempId;
  wbFinal.next_match_winner_slot = 1;

  // Wire LB final winner -> GF slot 2
  lbFinal.next_match_winner_id = gf.tempId;
  lbFinal.next_match_winner_slot = 2;

  // Note: GF -> reset wiring is handled by the DB layer at runtime, since
  // the reset only triggers if the LB winner wins (slot 2 wins). We leave
  // gf.next_match_winner_id and next_match_loser_id null here; bracketDb.js
  // populates the reset match conditionally.

  return matches;
}


// =============================================================================
// PLAY-ORDER MATCH NUMBERING
// =============================================================================

/**
 * Assign sequential play-order numbers to every match.
 *
 * Rules:
 *   - LB byes (single-feeder LB matches) are SKIPPED for numbering since
 *     they're not played.
 *   - The grand final reset is numbered LAST (it may not be played).
 *   - All other matches get numbered in dependency-respecting order.
 *
 * Tie-breakers when multiple matches are "ready" to be numbered, in order
 * of importance (highest first):
 *   1. PLAYER REST: avoid scheduling a player who appeared in either of the
 *      last 2 numbered matches. This gives every player at least 2 matches
 *      of rest between their own matches whenever possible. Hardest constraint.
 *   2. Bracket alternation: prefer the OPPOSITE bracket from the last numbered
 *   3. Earlier rounds first
 *   4. Lower position-in-round first
 *
 * @param {Array} matches - all match objects (mutated in place to set match_number)
 */
function assignPlayOrderNumbers(matches) {
  // Number of recent matches whose players we try to avoid scheduling again.
  // 2 = a player gets at least 2 matches of rest between appearances when possible.
  const REST_WINDOW = 2;

  const matchByTempId = {};
  for (const m of matches) matchByTempId[m.tempId] = m;

  const numbered = new Set();

  // Helper: who are the possible players in this match?
  // Walks the feeder graph to collect the set of players that could end up here.
  function possiblePlayers(tempId, depth = 0) {
    if (depth > 30) return new Set();
    const m = matchByTempId[tempId];
    if (!m) return new Set();
    const set = new Set();
    if (m.player1_id) set.add(m.player1_id);
    if (m.player2_id) set.add(m.player2_id);

    // Walk feeders by checking which matches point INTO this one
    for (const candidate of matches) {
      if (candidate.next_match_winner_id === m.tempId ||
          candidate.next_match_loser_id === m.tempId) {
        for (const p of possiblePlayers(candidate.tempId, depth + 1)) {
          set.add(p);
        }
      }
    }
    return set;
  }

  // Find direct feeders for a given match (matches that point INTO this one)
  function getDirectFeederIds(target) {
    const feeders = [];
    for (const candidate of matches) {
      if (candidate.next_match_winner_id === target.tempId ||
          candidate.next_match_loser_id === target.tempId) {
        feeders.push(candidate.tempId);
      }
    }
    return feeders;
  }

  // Find EFFECTIVE feeders for a given match. If a direct feeder is an
  // LB bye (auto-advance, not played), we recursively look at THAT bye's
  // feeders instead. This way the dependency chain reflects what actually
  // gets played, not what's structurally listed in the bracket.
  function getEffectiveFeederIds(target, depth = 0) {
    if (depth > 30) return []; // safety against any cycle
    const direct = getDirectFeederIds(target);
    const effective = [];
    for (const fid of direct) {
      const f = matchByTempId[fid];
      if (f && f.is_lb_bye) {
        // Skip past the bye and pull in its own feeders instead
        for (const upId of getEffectiveFeederIds(f, depth + 1)) {
          effective.push(upId);
        }
      } else {
        effective.push(fid);
      }
    }
    return effective;
  }

  let counter = 1;
  let lastBracket = null;

  // Rolling window of definite players from the last REST_WINDOW matches.
  // We use DEFINITE players (player1_id / player2_id directly assigned),
  // not "possible players" walked from feeders, because for early-round
  // matches the possible-set is huge and would over-restrict the algorithm.
  // Definite players covers the case that matters: a confirmed player
  // who literally just played.
  const recentPlayerSets = []; // array of Sets, oldest first

  // Get the set of DEFINITE players in a match (no feeder walk)
  function definitePlayers(m) {
    const set = new Set();
    if (m.player1_id) set.add(m.player1_id);
    if (m.player2_id) set.add(m.player2_id);
    return set;
  }

  while (true) {
    // Find ready matches: not yet numbered, not the reset, not an LB bye,
    // and all EFFECTIVE feeders (skipping past any LB byes) are numbered.
    const ready = matches.filter((m) => {
      if (numbered.has(m.tempId)) return false;
      if (m.bracket === 'grand_final_reset') return false;
      if (m.is_lb_bye) return false;
      const effectiveFeeders = getEffectiveFeederIds(m);
      return effectiveFeeders.every((fid) => numbered.has(fid));
    });

    if (ready.length === 0) break;

    // Build the union of recent-match players across the rolling window
    const recentPlayersUnion = new Set();
    for (const playerSet of recentPlayerSets) {
      for (const p of playerSet) recentPlayersUnion.add(p);
    }

    // Score each ready match (lower = better).
    // Penalty values are weighted so player rest dominates bracket alternation:
    //   - 1 player overlap = +1000 (one of this match's confirmed players just played recently)
    //   - same bracket as last = +50 (cosmetic preference)
    //   - round-based ordering = +5 per round
    //   - position tiebreaker = +0.1 per position
    const scored = ready.map((m) => {
      let score = 0;

      // Penalty 1: player rest violation
      // Only check definite (already-assigned) players. A match with abstract
      // feeders that haven't been resolved yet doesn't have a concrete player
      // overlap with anything. This sidesteps the false-positive problem
      // where every early-round match would "possibly" contain every player.
      const myPlayers = definitePlayers(m);
      let restViolations = 0;
      for (const p of myPlayers) {
        if (recentPlayersUnion.has(p)) restViolations++;
      }
      score += restViolations * 1000;

      // Penalty 2: same bracket as last numbered match (cosmetic)
      if (lastBracket && m.bracket === lastBracket) score += 50;

      // Penalty 3: prefer earlier rounds
      score += m.round * 5;

      // Penalty 4: prefer lower position
      score += m.position_in_round * 0.1;

      return { match: m, score };
    });

    scored.sort((a, b) => a.score - b.score);
    const chosen = scored[0].match;

    chosen.match_number = counter++;
    numbered.add(chosen.tempId);

    lastBracket = chosen.bracket;

    // Update the rolling window: push this match's definite players, drop oldest
    recentPlayerSets.push(definitePlayers(chosen));
    if (recentPlayerSets.length > REST_WINDOW) {
      recentPlayerSets.shift();
    }
  }

  // Reset match goes last
  const resetMatch = matches.find((m) => m.bracket === 'grand_final_reset');
  if (resetMatch) {
    resetMatch.match_number = counter++;
  }

  // LB byes don't get a match_number (they're not played).
  // We leave match_number undefined for them.
}
