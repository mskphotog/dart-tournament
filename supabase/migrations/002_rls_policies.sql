-- =============================================================================
-- DART TOURNAMENT APP - ROW LEVEL SECURITY POLICIES
-- =============================================================================
-- This migration sets up Row Level Security (RLS) so that:
--  - Anyone (including unauthenticated users) can READ tournament data
--    (live brackets and standings are public)
--  - Only authenticated admins can INSERT, UPDATE, or DELETE
--
-- The "admin" role is granted by setting the user's app_metadata.role to "admin"
-- in the Supabase dashboard or via SQL after creating the user.
--
-- Run this AFTER 001_initial_schema.sql.
-- =============================================================================


-- Helper function to check if the current user is an admin
-- Reads the role from JWT claims (set in app_metadata)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- -----------------------------------------------------------------------------
-- Enable RLS on all tables
-- -----------------------------------------------------------------------------
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_points_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- PLAYERS POLICIES
-- -----------------------------------------------------------------------------
-- Anyone can view players (public read for standings)
CREATE POLICY "Anyone can view players"
  ON players FOR SELECT
  USING (true);

-- Only admins can add/edit/delete players
CREATE POLICY "Admins can insert players"
  ON players FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update players"
  ON players FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins can delete players"
  ON players FOR DELETE
  USING (is_admin());


-- -----------------------------------------------------------------------------
-- GAME TYPES POLICIES
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view game types"
  ON game_types FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage game types"
  ON game_types FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- TOURNAMENTS POLICIES
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view tournaments"
  ON tournaments FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage tournaments"
  ON tournaments FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- TOURNAMENT PLAYERS POLICIES
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view tournament players"
  ON tournament_players FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage tournament players"
  ON tournament_players FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- MATCHES POLICIES
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view matches"
  ON matches FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage matches"
  ON matches FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- GAMES POLICIES
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view games"
  ON games FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage games"
  ON games FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- PLACEMENT POINTS CONFIG POLICIES
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view placement config"
  ON placement_points_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage placement config"
  ON placement_points_config FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- AUDIT LOG POLICIES
-- -----------------------------------------------------------------------------
-- Only admins can read or write the audit log
CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (is_admin());


-- =============================================================================
-- END OF RLS POLICIES
-- =============================================================================
