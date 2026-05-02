-- =============================================================================
-- DART TOURNAMENT APP - INITIAL SCHEMA
-- =============================================================================
-- This migration creates all the tables needed to run weekly dart tournaments
-- with double-elimination brackets and season-long points tracking.
--
-- Run this in the Supabase SQL Editor first, before any other migrations.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PLAYERS: persistent roster of all players who have ever played
-- -----------------------------------------------------------------------------
-- A player exists independently of any tournament. They get added once and
-- can be checked into many weekly tournaments over time. Walk-ins also get
-- a row here when they first show up.
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Display name shown in brackets and standings
  name TEXT NOT NULL,
  -- Optional email for future features (not used for auth in v1)
  email TEXT,
  -- Optional phone number
  phone TEXT,
  -- Whether this player is on the regular roster vs a one-time walk-in
  -- Walk-ins can be promoted to roster later by admin
  is_roster BOOLEAN NOT NULL DEFAULT true,
  -- Whether the player is currently active (false = retired/removed from roster)
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Optional avatar URL (Supabase Storage in future version)
  avatar_url TEXT,
  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast name lookups in admin search
CREATE INDEX idx_players_name ON players(name);
CREATE INDEX idx_players_active ON players(is_active) WHERE is_active = true;


-- -----------------------------------------------------------------------------
-- GAME TYPES: library of dart games (Cricket, 501, Tic-Tac-Toe, etc.)
-- -----------------------------------------------------------------------------
-- Admin defines the games available in the system. Each game has a default
-- match format (best-of-3, best-of-5, etc.) which can be overridden per
-- tournament. Admin can add new games on the fly each week.
CREATE TABLE game_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Display name like "Cricket" or "Cut-Throat Cricket"
  name TEXT NOT NULL UNIQUE,
  -- Optional description shown to players
  description TEXT,
  -- Default best-of for matches in this game type
  -- Stored as games_to_win (e.g., 2 means best-of-3, must win 2)
  default_games_to_win INTEGER NOT NULL DEFAULT 2 CHECK (default_games_to_win >= 1),
  -- Whether this game type is currently available for selection
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- TOURNAMENTS: each weekly Wednesday tournament
-- -----------------------------------------------------------------------------
-- One row per Wednesday night event. Holds the configuration for that night
-- including which game type is being played and the match format.
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Date the tournament is held
  tournament_date DATE NOT NULL,
  -- Optional name override (defaults to "Weekly Tournament - <date>")
  name TEXT,
  -- The game being played this week (foreign key to game_types)
  game_type_id UUID NOT NULL REFERENCES game_types(id) ON DELETE RESTRICT,
  -- Override default games_to_win for this specific tournament
  -- NULL means use the default from game_types
  games_to_win_override INTEGER CHECK (games_to_win_override IS NULL OR games_to_win_override >= 1),
  -- Lifecycle status:
  -- 'setup'      = created, players being added, bracket not yet generated
  -- 'in_progress' = bracket generated, matches being played
  -- 'completed'  = champion declared, season points awarded
  -- 'cancelled'  = tournament was cancelled
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'in_progress', 'completed', 'cancelled')),
  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tournaments_date ON tournaments(tournament_date DESC);
CREATE INDEX idx_tournaments_status ON tournaments(status);


-- -----------------------------------------------------------------------------
-- TOURNAMENT PLAYERS: which players checked in to a given tournament
-- -----------------------------------------------------------------------------
-- This is a junction table. A player only appears in a bracket if they have
-- a row here. Also stores the random seed assigned during bracket generation
-- and the player's final placement (1st, 2nd, etc.) once the tournament ends.
CREATE TABLE tournament_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  -- Random seed number assigned at bracket generation (1, 2, 3...)
  -- NULL until bracket is generated
  seed INTEGER,
  -- Final placement once tournament completes (1 = champion, 2 = runner-up, etc.)
  -- NULL until tournament is completed
  final_placement INTEGER,
  -- Bonus points awarded for placement (admin-configurable per tournament)
  placement_points INTEGER DEFAULT 0,
  -- Win points (1 per match won)
  win_points INTEGER DEFAULT 0,
  -- Audit timestamp
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A player can only be checked in once per tournament
  UNIQUE(tournament_id, player_id),
  -- Seeds must be unique within a tournament
  UNIQUE(tournament_id, seed)
);

CREATE INDEX idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX idx_tournament_players_player ON tournament_players(player_id);


-- -----------------------------------------------------------------------------
-- MATCHES: individual matchups in the bracket
-- -----------------------------------------------------------------------------
-- This is the heart of the bracket. Each match represents one node in the
-- double-elimination tree. The bracket structure is encoded by the
-- "next_match_winner_id" and "next_match_loser_id" foreign keys, which
-- point to the matches that the winner and loser advance to.
--
-- For double elimination:
-- - Winner's bracket matches send loser to a Loser's bracket match
-- - Loser's bracket matches send loser to elimination (no next match)
-- - Both bracket finals feed the Grand Final
-- - Grand Final has a special reset_match_id for the bracket reset scenario
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  -- Which bracket this match belongs to:
  -- 'winners' = winner's bracket
  -- 'losers'  = loser's bracket
  -- 'grand_final' = the championship match
  -- 'grand_final_reset' = the bracket reset match (only played if needed)
  bracket TEXT NOT NULL CHECK (bracket IN ('winners', 'losers', 'grand_final', 'grand_final_reset')),
  -- Round number within the bracket (1, 2, 3...)
  round INTEGER NOT NULL,
  -- Position within the round (1, 2, 3...) used for display ordering
  match_number INTEGER NOT NULL,
  -- The two competitors. NULL means "winner of a previous match" not yet determined
  -- or "TBD" while waiting for an opponent
  player1_id UUID REFERENCES players(id) ON DELETE SET NULL,
  player2_id UUID REFERENCES players(id) ON DELETE SET NULL,
  -- The winner once the match completes (NULL until match is finished)
  winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
  -- Match games_to_win (copied from tournament when match is created)
  -- Best-of-3 = 2, best-of-5 = 3
  games_to_win INTEGER NOT NULL,
  -- Score totals (number of games each player has won)
  player1_score INTEGER NOT NULL DEFAULT 0,
  player2_score INTEGER NOT NULL DEFAULT 0,
  -- Match lifecycle:
  -- 'pending'     = waiting for both players to be determined
  -- 'ready'       = both players known, match can start
  -- 'in_progress' = first game has been recorded
  -- 'completed'   = winner determined
  -- 'bye'         = one player has a bye, no match needed
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'bye')),
  -- Where the winner advances to (NULL = end of bracket / champion)
  next_match_winner_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  -- Whether the winner becomes player1 or player2 in the next match
  next_match_winner_slot INTEGER CHECK (next_match_winner_slot IN (1, 2)),
  -- Where the loser drops to (NULL = eliminated from tournament)
  next_match_loser_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  -- Whether the loser becomes player1 or player2 in their next match
  next_match_loser_slot INTEGER CHECK (next_match_loser_slot IN (1, 2)),
  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_status ON matches(tournament_id, status);
CREATE INDEX idx_matches_bracket ON matches(tournament_id, bracket, round, match_number);


-- -----------------------------------------------------------------------------
-- GAMES: individual games within a match (game 1, game 2, game 3 of a BO3)
-- -----------------------------------------------------------------------------
-- Each match consists of multiple games (best-of-3, best-of-5). This table
-- records each individual game outcome. Useful for detailed history and
-- match recap views.
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  -- Which game in the match (1, 2, 3...)
  game_number INTEGER NOT NULL,
  -- Winner of this individual game
  winner_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  -- Audit timestamp
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Game numbers must be unique within a match
  UNIQUE(match_id, game_number)
);

CREATE INDEX idx_games_match ON games(match_id);


-- -----------------------------------------------------------------------------
-- PLACEMENT POINTS CONFIG: admin-configurable bonus points for placement
-- -----------------------------------------------------------------------------
-- Admin can set how many bonus points each placement gets (1st, 2nd, 3rd, 4th).
-- Stored as a single global config row that applies to all future tournaments.
-- Past tournaments keep whatever points they were awarded at the time.
CREATE TABLE placement_points_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The placement (1 = 1st, 2 = 2nd, etc.)
  placement INTEGER NOT NULL UNIQUE CHECK (placement >= 1),
  -- Points awarded for this placement
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- AUDIT LOG: track admin overrides for accountability
-- -----------------------------------------------------------------------------
-- Whenever an admin manually edits the bracket (force a winner, swap players,
-- undo a result), it gets logged here for transparency. Useful for resolving
-- disputes after the fact.
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What was done (e.g., "force_winner", "swap_players", "undo_match", "edit_score")
  action TEXT NOT NULL,
  -- Free-form description of the change
  description TEXT NOT NULL,
  -- Tournament context (if applicable)
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  -- Match context (if applicable)
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  -- Who did it (Supabase auth user id)
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- When it happened
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_tournament ON audit_log(tournament_id);
CREATE INDEX idx_audit_log_performed_at ON audit_log(performed_at DESC);


-- -----------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- -----------------------------------------------------------------------------

-- Auto-update the updated_at timestamp on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_players_updated_at BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_tournaments_updated_at BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- -----------------------------------------------------------------------------
-- SEASON STANDINGS VIEW
-- -----------------------------------------------------------------------------
-- A computed view that aggregates total season points per player.
-- Frontend can SELECT from this directly to render the standings page.
-- Recalculated automatically on every query (no triggers needed).
CREATE OR REPLACE VIEW season_standings AS
SELECT
  p.id AS player_id,
  p.name AS player_name,
  p.avatar_url,
  -- Sum of all win points across all completed tournaments
  COALESCE(SUM(tp.win_points), 0) AS total_win_points,
  -- Sum of all placement bonus points across all completed tournaments
  COALESCE(SUM(tp.placement_points), 0) AS total_placement_points,
  -- Combined total
  COALESCE(SUM(tp.win_points + tp.placement_points), 0) AS total_points,
  -- Tournament participation stats
  COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) AS tournaments_played,
  COUNT(DISTINCT CASE WHEN tp.final_placement = 1 THEN t.id END) AS tournaments_won
FROM players p
LEFT JOIN tournament_players tp ON tp.player_id = p.id
LEFT JOIN tournaments t ON t.id = tp.tournament_id AND t.status = 'completed'
WHERE p.is_active = true
GROUP BY p.id, p.name, p.avatar_url
ORDER BY total_points DESC, p.name ASC;


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
