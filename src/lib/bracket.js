/**
 * DOUBLE-ELIMINATION BRACKET ENGINE
 * =============================================================================
 *
 * Generates a seeded double-elimination bracket for 6–25 players, matching
 * the exact structure shown in the BracketHQ reference images.
 *
 * SEEDING MODEL
 * -------------
 * Seeds are assigned randomly at generation time (shuffle → seed 1 = first
 * shuffled player, etc.). The WB slot order uses the standard seeded bracket
 * pattern so that seeds 1 and 2 are in opposite halves and can only meet in
 * the final. Top seeds receive byes when player count < next power of 2.
 *
 * BYE MODEL
 * ---------
 * byeCount = nextPowerOfTwo(n) − n. Seeds 1..byeCount receive byes and enter
 * directly in WB R2. Seeds (byeCount+1)..n play WB R1 (pre-round) matches.
 * Losers of WB R1 drop to LB R1. If WB R1 has an odd number of matches, one
 * LB R1 slot has a single feeder (LB bye — auto-advance, not played).
 *
 * WB STRUCTURE
 * ------------
 * The WB has bracketSize slots arranged in pairs. Each pair of adjacent slots
 * forms one "R1 slot-pair". We process these pairs to build R2 matches:
 *
 * For each R1 slot-pair (seedA, seedB):
 *   - Both active (no byes): create a WB R1 match. The winner feeds R2.
 *   - One or both have byes: no WB R1 match. The players go directly to R2.
 *
 * Each R2 match pairs two adjacent R1 slot-pairs:
 *   - Slot 1 of R2 comes from the FIRST player of the left slot-pair
 *   - Slot 2 of R2 comes from the FIRST player of the right slot-pair
 *   (where "first player" = the winner of the R1 match, or the direct player)
 *
 * Wait — that's not right either. Let me think about this more carefully.
 *
 * CORRECT R2 WIRING MODEL
 * -----------------------
 * Each R2 match has exactly 2 slots. It is fed by exactly 2 "sources":
 *   Source A = left R1 slot-pair result
 *   Source B = right R1 slot-pair result
 *
 * Each source contributes EXACTLY ONE player to the R2 match:
 *   - If source is a real R1 match: the winner of that match → one R2 slot
 *   - If source is a direct player: that player → one R2 slot
 *
 * But each R1 slot-pair has TWO players. When both have byes (direct pair),
 * BOTH players go to R2 — but they go to DIFFERENT R2 matches!
 *   - Player A (top of pair) → R2 match on the left
 *   - Player B (bottom of pair) → R2 match on the right
 *
 * This is the key insight: in a bye-pair, the two players are NOT opponents
 * in R2. They are in DIFFERENT R2 matches. The bracket structure means:
 *   - Slot-pair i feeds slot 1 of R2 match (i/2)
 *   - Slot-pair i+1 feeds slot 2 of R2 match (i/2)
 *
 * So for R2 match j:
 *   - Slot 1 comes from slot-pair 2j (the "top" player of that pair)
 *   - Slot 2 comes from slot-pair 2j+1 (the "top" player of that pair)
 *
 * For a real R1 match: "top player" = winner of the match
 * For a direct pair: "top player" = the player from the EVEN slot (slot 2j)
 *                    "bottom player" = the player from the ODD slot (slot 2j+1)
 *
 * In a direct pair, both players end up in the SAME R2 match as opponents!
 * (Because both slots of the pair go to the same R2 match.)
 *
 * Let me re-examine: for bracketSize=8, n=6 (byeCount=2):
 * wbSlotOrder = [1, 8, 5, 4, 3, 6, 7, 2]
 * R1 slot-pairs: (1,8), (5,4), (3,6), (7,2)
 * Seeds 1,2 have byes. So:
 *   Pair 0: seeds 1,8 → seed 1 has bye, seed 8 is active → direct pair
 *   Pair 1: seeds 5,4 → both active → R1 match (5 vs 4)
 *   Pair 2: seeds 3,6 → both active → R1 match (3 vs 6)
 *   Pair 3: seeds 7,2 → seed 2 has bye, seed 7 is active → direct pair
 *
 * R2 matches (bracketSize/4 = 2 matches):
 *   R2 match 0 ← pairs 0 and 1:
 *     Pair 0 is direct (seed 1 and seed 8). But only ONE of them goes to R2 match 0.
 *     Pair 1 is a real match (5 vs 4). Winner goes to R2 match 0.
 *
 * Hmm, but in the 6-player bracket image:
 *   - Seed 1 gets a bye and plays the winner of match 1 (seeds 5 vs 4) in WB R2
 *   - Seed 2 gets a bye and plays the winner of match 2 (seeds 3 vs 6) in WB R2
 *   - Seed 8 (doesn't exist for n=6) → actually for n=6, seeds are 1-6
 *
 * Wait — for n=6, bracketSize=8, byeCount=2:
 * wbSlotOrder = [1, 8, 5, 4, 3, 6, 7, 2]
 * But we only have players for seeds 1-6. Seeds 7 and 8 don't exist.
 * So pair (7,2): seed 7 doesn't exist, seed 2 has a bye → only seed 2 is real
 * And pair (1,8): seed 1 has a bye, seed 8 doesn't exist → only seed 1 is real
 *
 * So the "direct" pairs for n=6 are:
 *   Pair 0: (seed 1 [bye], seed 8 [doesn't exist]) → only seed 1 goes to R2
 *   Pair 3: (seed 7 [doesn't exist], seed 2 [bye]) → only seed 2 goes to R2
 *
 * And R2 matches:
 *   R2 match 0 ← pair 0 (seed 1) + pair 1 (winner of 5 vs 4): seed 1 vs winner
 *   R2 match 1 ← pair 2 (winner of 3 vs 6) + pair 3 (seed 2): winner vs seed 2
 *
 * This matches the 6-player reference image! ✓
 *
 * So the correct model is:
 * Each slot-pair contributes EXACTLY ONE "slot representative" to its R2 match:
 *   - Real R1 match → winner of that match
 *   - Direct pair → the one real player in that pair (could be p1 or p2)
 *
 * For direct pairs, exactly one of the two seeds is a real player (the other
 * either has a bye or doesn't exist). That one real player is the representative.
 *
 * But what about "double direct" pairs where BOTH seeds are real bye-recipients?
 * Example: n=12, bracketSize=16, byeCount=4. Seeds 1-4 have byes.
 * wbSlotOrder for size 16: [1,16,9,8,5,12,13,4,3,14,11,6,7,10,15,2]
 * Pair 0: (1,16) → seed 1 has bye, seed 16 doesn't exist → only seed 1
 * Pair 1: (9,8) → both active → R1 match
 * Pair 2: (5,12) → seed 5 active, seed 12 active → R1 match
 * Pair 3: (13,4) → seed 13 active, seed 4 has bye → only seed 4 (bye)
 * ...
 *
 * For n=12: seeds 1-4 have byes, seeds 5-12 are active.
 * Pair 3: (13,4) → seed 13 doesn't exist (n=12), seed 4 has bye → only seed 4
 * So pair 3 contributes seed 4 directly to R2.
 *
 * R2 match 1 ← pair 2 (winner of 5 vs 12) + pair 3 (seed 4):
 *   Slot 1 = winner of (5 vs 12), Slot 2 = seed 4
 *
 * This matches the 12-player reference image! ✓
 *
 * CONCLUSION: Each slot-pair has exactly one "representative":
 *   - Real R1 match → winner (feeder link)
 *   - Direct (one real player) → that player (direct placement)
 *   - Both players have byes (double-bye pair) → BOTH go to the SAME R2 match
 *     as slot 1 and slot 2 respectively
 *
 * Wait, can we have a double-bye pair? Only if two adjacent seeds both have byes.
 * For n=8, byeCount=0: no byes, all pairs are real matches.
 * For n=9, byeCount=7: seeds 1-7 have byes. Only seed 8 and 9 are active.
 * wbSlotOrder for size 16: [1,16,9,8,5,12,13,4,3,14,11,6,7,10,15,2]
 * Pair 3 (slots 6,7): seeds 13,4 → both have byes → double-bye pair!
 * Both seed 4 and seed 13... but seed 13 doesn't exist for n=9.
 * So pair 3: seed 13 (doesn't exist), seed 4 (has bye) → only seed 4 is real.
 *
 * For n=9, only seeds 8 and 9 are active:
 * Pair 3 (slots 4,5): seeds 8,5 → seed 8 active, seed 5 has bye → seed 8 is active
 * Wait, let me recheck: wbSlotOrder[8]=5, wbSlotOrder[9]=12... 
 * Actually pair index 4 (slots 8,9): seeds 5,12 → seed 5 has bye, seed 12 doesn't exist
 *
 * The key insight: for any player count 6-25, we NEVER have a pair where BOTH
 * players are real AND both have byes. A "bye" means the seed exists but doesn't
 * play in R1. A "missing" seed means the slot is empty (seed > n).
 *
 * So each slot-pair is one of:
 *   A) Both seeds are active (seed > byeCount AND seed ≤ n): real R1 match
 *   B) One seed is active, other is bye or missing: one direct player
 *   C) Both seeds are bye or missing: zero or one direct player
 *      - If both are byes (both seeds ≤ byeCount): two direct players → same R2 match
 *      - If one is bye and one is missing: one direct player
 *      - If both are missing: empty (shouldn't happen for 6-25)
 *
 * For case C (double-bye): both players go to the same R2 match as opponents.
 * This happens when two adjacent bye-seeds are paired together.
 *
 * =============================================================================
 */


// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate a complete seeded double-elimination bracket.
 *
 * @param {Array}  players    - Array of { id, name }. Length must be 6–25.
 * @param {number} gamesToWin - Games needed to win a match (e.g. 2 for best-of-3).
 * @returns {{ matches: Array, seedAssignments: Array }}
 */
export function generateDoubleEliminationBracket(players, gamesToWin = 2, topSeedPlayerId = null) {
  if (!players || players.length < 6 || players.length > 25) {
    throw new Error('Player count must be between 6 and 25');
  }

  resetTempIdCounter();

  const n = players.length;

  // ── Step 1: Randomly assign seeds ─────────────────────────────────────────
  // If topSeedPlayerId is provided, that player is fixed as seed 1;
  // the remaining players are shuffled for seeds 2..n.
  let shuffled;
  if (topSeedPlayerId) {
    const topPlayer = players.find((p) => p.id === topSeedPlayerId);
    const rest = shuffleArray(players.filter((p) => p.id !== topSeedPlayerId));
    shuffled = topPlayer ? [topPlayer, ...rest] : shuffleArray([...players]);
  } else {
    shuffled = shuffleArray([...players]);
  }
  const seedAssignments = shuffled.map((p, i) => ({ player_id: p.id, seed: i + 1 }));
  const seededPlayers   = shuffled.map((p, i) => ({ ...p, seed: i + 1 }));

  // ── Step 2: Determine bracket size and byes ────────────────────────────────
  const bracketSize = nextPowerOfTwo(n);   // 8, 16, or 32
  const byeCount    = bracketSize - n;     // seeds 1..byeCount get byes

  // Build lookup: seed → player object (only seeds 1..n exist)
  const playerBySeed = {};
  for (const p of seededPlayers) playerBySeed[p.seed] = p;

  // ── Step 3: Build seeded WB slot order ────────────────────────────────────
  const wbSlotOrder = buildBracketSlotOrder(bracketSize);

  // ── Step 4: Build Winner's Bracket ────────────────────────────────────────
  const { wbMatches, wbByRound } = buildWinnersBracket(
    wbSlotOrder, playerBySeed, byeCount, n, bracketSize, gamesToWin
  );

  // ── Step 5: Build Loser's Bracket ─────────────────────────────────────────
  const { lbMatches } = buildLosersBracket(wbByRound, bracketSize, gamesToWin);

  // ── Step 6: Grand Final + Bracket Reset ───────────────────────────────────
  const finalMatches = buildGrandFinal(wbMatches, lbMatches, gamesToWin);

  // ── Step 7: Assign play-order match numbers ────────────────────────────────
  const allMatches = [...wbMatches, ...lbMatches, ...finalMatches];
  assignPlayOrderNumbers(allMatches, n);

  // ── Step 8: Set initial statuses ──────────────────────────────────────────
  for (const m of allMatches) {
    if (m.is_lb_bye) { m.status = 'pending'; continue; }
    m.status = (m.player1_id && m.player2_id) ? 'ready' : 'pending';
  }

  return { matches: allMatches, seedAssignments };
}


// =============================================================================
// BRACKET SLOT ORDER
// =============================================================================

/**
 * Build the standard seeded bracket slot order for `size` slots.
 * Result: slots[i] = seed number for WB slot i (0-indexed).
 * Adjacent pairs (0,1), (2,3), … are the R1 matchups.
 * Seeds 1 and 2 end up in opposite halves; they can only meet in the final.
 */
function buildBracketSlotOrder(size) {
  let slots = [1, 2];
  while (slots.length < size) {
    const next = [];
    const total = slots.length * 2;
    for (const s of slots) {
      next.push(s);
      next.push(total + 1 - s);
    }
    slots = next;
  }
  return slots;
}


// =============================================================================
// WINNER'S BRACKET BUILDER
// =============================================================================

/**
 * Build the Winner's Bracket.
 *
 * Each R1 slot-pair (seedA, seedB) is classified:
 *   - Both active (seed > byeCount AND seed ≤ n): real WB R1 match
 *   - Otherwise: "direct" — each real player in the pair goes directly to R2
 *
 * Each R2 match is fed by two adjacent slot-pairs. Each slot-pair contributes
 * exactly one "representative" to the R2 match:
 *   - Real R1 match → winner (feeder link)
 *   - Direct with one real player → that player (direct placement)
 *   - Direct with two real players (double-bye) → both go to same R2 as p1/p2
 *
 * The representative of a slot-pair goes into the R2 slot corresponding to
 * whether it's the LEFT (slot 1) or RIGHT (slot 2) of the R2 match.
 */
function buildWinnersBracket(wbSlotOrder, playerBySeed, byeCount, n, bracketSize, gamesToWin) {
  const wbMatches = [];
  const wbByRound = {};
  const wbRoundCount = Math.log2(bracketSize);
  const r1PairCount  = bracketSize / 2;

  // ── Classify each R1 slot-pair and create WB R1 matches ───────────────────
  wbByRound[1] = [];

  // For each slot-pair, compute its "representative" for R2 wiring.
  // representative = { type: 'match'|'direct_p1'|'direct_p2'|'double_bye'|'empty',
  //                    match?, player?, playerA?, playerB? }
  const r1Reps = [];

  for (let i = 0; i < r1PairCount; i++) {
    const seedA = wbSlotOrder[2 * i];
    const seedB = wbSlotOrder[2 * i + 1];

    const pA = (seedA <= n) ? playerBySeed[seedA] : null;
    const pB = (seedB <= n) ? playerBySeed[seedB] : null;

    const aIsActive = pA && seedA > byeCount;
    const bIsActive = pB && seedB > byeCount;

    if (aIsActive && bIsActive) {
      // Both active → real WB R1 match
      const m = makeMatch('winners', 1, wbByRound[1].length, pA.id, pB.id, gamesToWin);
      wbByRound[1].push(m);
      wbMatches.push(m);
      r1Reps.push({ type: 'match', match: m });
    } else if (aIsActive && !bIsActive) {
      // Only A is active; B is a bye or missing
      // A goes directly to R2 as slot 1 representative
      // B (if it's a real bye player) also needs to be placed in R2
      if (pB) {
        // B is a real bye player → double-direct: A and B both go to same R2 match
        r1Reps.push({ type: 'double_direct', playerA: pA, playerB: pB });
      } else {
        // B doesn't exist → only A goes to R2
        r1Reps.push({ type: 'single', player: pA });
      }
    } else if (!aIsActive && bIsActive) {
      // Only B is active; A is a bye or missing
      if (pA) {
        // A is a real bye player → double-direct
        r1Reps.push({ type: 'double_direct', playerA: pA, playerB: pB });
      } else {
        r1Reps.push({ type: 'single', player: pB });
      }
    } else {
      // Neither is active
      if (pA && pB) {
        // Both are bye players → double-direct (they play each other in R2)
        r1Reps.push({ type: 'double_direct', playerA: pA, playerB: pB });
      } else if (pA) {
        r1Reps.push({ type: 'single', player: pA });
      } else if (pB) {
        r1Reps.push({ type: 'single', player: pB });
      } else {
        r1Reps.push({ type: 'empty' });
      }
    }
  }

  // ── WB Round 2 ─────────────────────────────────────────────────────────────
  // Each R2 match is fed by two adjacent r1Reps entries (left=slot1, right=slot2).
  const r2Count = r1PairCount / 2;
  wbByRound[2] = [];

  for (let i = 0; i < r2Count; i++) {
    const repLeft  = r1Reps[2 * i];
    const repRight = r1Reps[2 * i + 1];

    const m = makeMatch('winners', 2, i, null, null, gamesToWin);

    // Wire left rep into slot 1
    applyRepToR2Slot(repLeft,  m, 1);
    // Wire right rep into slot 2
    applyRepToR2Slot(repRight, m, 2);

    wbByRound[2].push(m);
    wbMatches.push(m);
  }

  // ── WB Rounds 3+ ───────────────────────────────────────────────────────────
  for (let r = 3; r <= wbRoundCount; r++) {
    const prev      = wbByRound[r - 1];
    const matchCount = prev.length / 2;
    wbByRound[r]    = [];

    for (let i = 0; i < matchCount; i++) {
      const m = makeMatch('winners', r, i, null, null, gamesToWin);
      prev[2 * i].next_match_winner_id       = m.tempId;
      prev[2 * i].next_match_winner_slot     = 1;
      prev[2 * i + 1].next_match_winner_id   = m.tempId;
      prev[2 * i + 1].next_match_winner_slot = 2;
      wbByRound[r].push(m);
      wbMatches.push(m);
    }
  }

  return { wbMatches, wbByRound };
}

/**
 * Apply an r1Rep to a specific slot of a WB R2 match.
 *
 * 'match'         → wire the R1 match winner into this slot
 * 'single'        → place the player directly into this slot
 * 'double_direct' → place BOTH players into the R2 match (slot 1 and slot 2)
 *                   regardless of which slot we're called with (only do this once)
 * 'empty'         → do nothing
 */
function applyRepToR2Slot(rep, r2Match, slot) {
  if (rep.type === 'match') {
    rep.match.next_match_winner_id   = r2Match.tempId;
    rep.match.next_match_winner_slot = slot;
  } else if (rep.type === 'single') {
    if (slot === 1) r2Match.player1_id = rep.player?.id || null;
    else            r2Match.player2_id = rep.player?.id || null;
  } else if (rep.type === 'double_direct') {
    // Both players go into this R2 match as opponents.
    // playerA → slot 1, playerB → slot 2 (regardless of which slot we're called with)
    // We only apply this once (when called for slot 1); skip for slot 2.
    if (slot === 1) {
      r2Match.player1_id = rep.playerA?.id || null;
      r2Match.player2_id = rep.playerB?.id || null;
    }
    // slot 2 call is a no-op (already filled by slot 1 call)
  }
  // 'empty' → no-op
}


// =============================================================================
// LOSER'S BRACKET BUILDER
// =============================================================================

/**
 * Build the Loser's Bracket.
 *
 * LB structure (alternating consolidation and drop rounds):
 *   LB R1 (consol): WB R1 losers paired together
 *                   Odd WB R1 count → one LB R1 match has single feeder (LB bye)
 *   LB R2 (drop):   LB R1 winners + WB R2 losers (one-to-one)
 *   LB R3 (consol): LB R2 winners paired together
 *   LB R4 (drop):   LB R3 winners + WB R3 losers
 *   … until 1 LB player remains
 *
 * Corresponding WB round for LB drop round r:
 *   LB R(2k) ← WB R(k+1) losers
 */
function buildLosersBracket(wbByRound, bracketSize, gamesToWin) {
  const lbMatches = [];
  const lbByRound = {};
  const wbRoundCount = Math.log2(bracketSize);
  const lbRoundCount = (wbRoundCount - 1) * 2;

  // ── LB Round 1: pair WB R1 losers ─────────────────────────────────────────
  const wbR1 = wbByRound[1] || [];
  const lbR1MatchCount = Math.ceil(wbR1.length / 2);
  lbByRound[1] = [];

  for (let i = 0; i < lbR1MatchCount; i++) {
    const m = makeMatch('losers', 1, i, null, null, gamesToWin);
    m.is_lb_bye = false;

    const feederA = wbR1[2 * i];
    const feederB = wbR1[2 * i + 1];

    if (feederA) {
      feederA.next_match_loser_id   = m.tempId;
      feederA.next_match_loser_slot = 1;
    }
    if (feederB) {
      feederB.next_match_loser_id   = m.tempId;
      feederB.next_match_loser_slot = 2;
    } else {
      m.is_lb_bye = true; // single feeder → LB bye
    }

    lbByRound[1].push(m);
    lbMatches.push(m);
  }

  // ── LB Rounds 2+ ──────────────────────────────────────────────────────────
  for (let r = 2; r <= lbRoundCount; r++) {
    const isDropRound = (r % 2 === 0);
    const prevLb      = lbByRound[r - 1] || [];
    lbByRound[r]      = [];

    if (isDropRound) {
      const correspondingWbRound = r / 2 + 1;
      const wbDroppers  = wbByRound[correspondingWbRound] || [];
      const matchCount  = Math.max(prevLb.length, wbDroppers.length);

      for (let i = 0; i < matchCount; i++) {
        const m = makeMatch('losers', r, i, null, null, gamesToWin);
        m.is_lb_bye = false;
        let feeders = 0;

        if (prevLb[i]) {
          prevLb[i].next_match_winner_id   = m.tempId;
          prevLb[i].next_match_winner_slot = 1;
          feeders++;
        }
        if (wbDroppers[i]) {
          wbDroppers[i].next_match_loser_id   = m.tempId;
          wbDroppers[i].next_match_loser_slot = 2;
          feeders++;
        }
        if (feeders === 1) m.is_lb_bye = true;

        lbByRound[r].push(m);
        lbMatches.push(m);
      }
    } else {
      const matchCount = Math.ceil(prevLb.length / 2);

      for (let i = 0; i < matchCount; i++) {
        const m = makeMatch('losers', r, i, null, null, gamesToWin);
        m.is_lb_bye = false;
        let feeders = 0;

        if (prevLb[2 * i]) {
          prevLb[2 * i].next_match_winner_id   = m.tempId;
          prevLb[2 * i].next_match_winner_slot = 1;
          feeders++;
        }
        if (prevLb[2 * i + 1]) {
          prevLb[2 * i + 1].next_match_winner_id   = m.tempId;
          prevLb[2 * i + 1].next_match_winner_slot = 2;
          feeders++;
        }
        if (feeders === 1) m.is_lb_bye = true;

        lbByRound[r].push(m);
        lbMatches.push(m);
      }
    }
  }

  return { lbMatches, lbByRound };
}


// =============================================================================
// GRAND FINAL + BRACKET RESET
// =============================================================================

function buildGrandFinal(wbMatches, lbMatches, gamesToWin) {
  const wbFinal = wbMatches.find(
    (m) => m.bracket === 'winners' && !m.next_match_winner_id
  );
  const lbFinal = lbMatches.find(
    (m) => m.bracket === 'losers' && !m.next_match_winner_id
  );

  if (!wbFinal || !lbFinal) {
    throw new Error('Could not locate WB final or LB final');
  }

  const gf    = makeMatch('grand_final',       1, 0, null, null, gamesToWin);
  const reset = makeMatch('grand_final_reset', 1, 0, null, null, gamesToWin);

  wbFinal.next_match_winner_id   = gf.tempId;
  wbFinal.next_match_winner_slot = 1;
  lbFinal.next_match_winner_id   = gf.tempId;
  lbFinal.next_match_winner_slot = 2;

  // GF → reset wiring handled at runtime by bracketDb.js
  return [gf, reset];
}


// =============================================================================
// PLAY-ORDER MATCH NUMBERING
// =============================================================================

/**
 * Assign sequential match numbers in play order.
 *
 * Priority rules (in order):
 *   1. Topological: all effective feeders must be numbered first
 *   2. Breadth-first: prefer matches where NEITHER player has played yet
 *   3. Idle time: prefer matches where players have waited longest
 *   4. Bracket alternation: prefer opposite bracket from last numbered
 *   5. Earlier round, then lower position
 *
 * LB byes are skipped (not played). Grand final reset is always last.
 */
function assignPlayOrderNumbers(allMatches) {
  const numbered = new Set();

  function effectiveFeeders(target, depth = 0) {
    if (depth > 40) return [];
    const result = [];
    for (const m of allMatches) {
      if (m.next_match_winner_id === target.tempId ||
          m.next_match_loser_id  === target.tempId) {
        if (m.is_lb_bye) {
          for (const f of effectiveFeeders(m, depth + 1)) result.push(f);
        } else {
          result.push(m.tempId);
        }
      }
    }
    return result;
  }

  function definitePlayers(m) {
    const set = new Set();
    if (m.player1_id) set.add(m.player1_id);
    if (m.player2_id) set.add(m.player2_id);
    return set;
  }

  const playerMatchCount   = {};
  const playerLastMatchNum = {};
  let counter     = 1;
  let lastBracket = null;

  while (true) {
    const ready = allMatches.filter((m) => {
      if (numbered.has(m.tempId))            return false;
      if (m.bracket === 'grand_final_reset') return false;
      if (m.is_lb_bye)                       return false;
      return effectiveFeeders(m).every((fid) => numbered.has(fid));
    });

    if (ready.length === 0) break;

    const scored = ready.map((m) => {
      const players = definitePlayers(m);
      let score = 0;

      // Priority 1 (breadth-first): penalise veterans
      let veterans = 0;
      for (const pid of players) {
        if ((playerMatchCount[pid] || 0) > 0) veterans++;
      }
      score += veterans * 2000;

      // Priority 2 (idle time): reward long waits
      let idleSum = 0;
      for (const pid of players) {
        idleSum += (counter - (playerLastMatchNum[pid] || 0));
      }
      score -= idleSum * 10;

      // Priority 3 (bracket alternation)
      if (lastBracket && m.bracket === lastBracket) score += 50;

      // Priority 4 (earlier rounds first)
      score += m.round * 5;

      // Priority 5 (lower position first)
      score += (m.position_in_round || 0) * 0.1;

      return { match: m, score };
    });

    scored.sort((a, b) => a.score - b.score);
    const chosen = scored[0].match;

    chosen.match_number = counter;
    numbered.add(chosen.tempId);
    lastBracket = chosen.bracket;

    for (const pid of definitePlayers(chosen)) {
      playerLastMatchNum[pid] = counter;
      playerMatchCount[pid]   = (playerMatchCount[pid] || 0) + 1;
    }

    counter++;
  }

  const resetMatch = allMatches.find((m) => m.bracket === 'grand_final_reset');
  if (resetMatch) resetMatch.match_number = counter;
}


// =============================================================================
// MATCH FACTORY + UTILITIES
// =============================================================================

let _tempIdCounter = 0;
function nextTempId()         { return `m${++_tempIdCounter}`; }
function resetTempIdCounter() { _tempIdCounter = 0; }

function makeMatch(bracket, round, positionInRound, p1Id, p2Id, gamesToWin) {
  return {
    tempId: nextTempId(),
    bracket,
    round,
    position_in_round: positionInRound,
    player1_id: p1Id || null,
    player2_id: p2Id || null,
    player1_score: 0,
    player2_score: 0,
    winner_id: null,
    status: 'pending',
    games_to_win: gamesToWin,
    next_match_winner_id:   null,
    next_match_winner_slot: null,
    next_match_loser_id:    null,
    next_match_loser_slot:  null,
    is_lb_bye: false,
    match_number: null,
  };
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}


// =============================================================================
// BOARD SCHEDULING (2-board next-match recommendation)
// =============================================================================

/**
 * Given the current state of all matches in a tournament, determine which
 * two matches should be played next (one per board).
 *
 * Rules (in priority order):
 *   1. Only consider matches with status='ready'
 *   2. Priority 1 (breadth-first): prefer matches where NEITHER player has
 *      played yet (get everyone their first match before second matches)
 *   3. Priority 2 (idle time): prefer matches where the sum of idle time
 *      (matches elapsed since each player last played) is greatest
 *   4. The two recommended matches must not share any players
 *
 * @param {Array}  matches       - All match objects for the tournament (from DB)
 * @param {Object} playerHistory - { [playerId]: { matchCount, lastMatchNumber } }
 * @returns {Array} Up to 2 match objects recommended for the two boards.
 */
export function getNextMatchesForBoards(matches, playerHistory = {}) {
  const ready = matches.filter((m) => m.status === 'ready');
  if (ready.length === 0) return [];

  const maxMatchNum = Math.max(...matches.map((m) => m.match_number || 0), 0);

  const scored = ready.map((m) => {
    const players = [m.player1_id, m.player2_id].filter(Boolean);
    let score = 0;

    let veterans = 0;
    for (const pid of players) {
      if ((playerHistory[pid]?.matchCount || 0) > 0) veterans++;
    }
    score += veterans * 2000;

    let idleSum = 0;
    for (const pid of players) {
      const lastNum = playerHistory[pid]?.lastMatchNumber || 0;
      idleSum += (maxMatchNum - lastNum);
    }
    score -= idleSum * 10;

    score += (m.match_number || 999) * 0.01;

    return { match: m, score };
  });

  scored.sort((a, b) => a.score - b.score);

  const result      = [];
  const usedPlayers = new Set();

  for (const { match: m } of scored) {
    if (result.length >= 2) break;
    const players = [m.player1_id, m.player2_id].filter(Boolean);
    if (players.some((pid) => usedPlayers.has(pid))) continue;
    result.push(m);
    players.forEach((pid) => usedPlayers.add(pid));
  }

  return result;
}


/**
 * Compute player history from a set of completed matches.
 * Returns { [playerId]: { matchCount, lastMatchNumber } }
 */
export function computePlayerHistory(matches) {
  const history = {};

  const completed = matches
    .filter((m) => m.status === 'completed' && m.winner_id)
    .sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

  for (const m of completed) {
    for (const pid of [m.player1_id, m.player2_id]) {
      if (!pid) continue;
      if (!history[pid]) history[pid] = { matchCount: 0, lastMatchNumber: 0 };
      history[pid].matchCount++;
      history[pid].lastMatchNumber = m.match_number || 0;
    }
  }

  return history;
}
