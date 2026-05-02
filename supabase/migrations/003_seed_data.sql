-- =============================================================================
-- DART TOURNAMENT APP - SEED DATA
-- =============================================================================
-- This migration populates the database with the initial set of game types
-- and default placement point values. Admin can edit all of these from the
-- app once logged in.
--
-- Run this AFTER 002_rls_policies.sql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- DEFAULT GAME TYPES
-- -----------------------------------------------------------------------------
-- Best-of-3 means games_to_win = 2 (must win 2 of 3)
-- Best-of-5 means games_to_win = 3 (must win 3 of 5)
INSERT INTO game_types (name, description, default_games_to_win) VALUES
  ('Cricket', 'Standard cricket: close numbers 15-20 and bullseye', 2),
  ('Tic-Tac-Toe', 'Dart tic-tac-toe on a 3x3 number grid', 2),
  ('301', 'Start at 301, race to zero, must double out', 2),
  ('501', 'Start at 501, race to zero, must double out', 3),
  ('Cut-Throat Cricket', 'Cricket variant where points work against opponents', 2);


-- -----------------------------------------------------------------------------
-- DEFAULT PLACEMENT POINTS
-- -----------------------------------------------------------------------------
-- These are the default bonus points awarded for tournament placement.
-- Admin can edit these from the app at any time.
-- Values are intentionally modest so that win points (1 per match) still matter.
INSERT INTO placement_points_config (placement, points) VALUES
  (1, 5),  -- Champion
  (2, 3),  -- Runner-up
  (3, 2),  -- Third place
  (4, 1);  -- Fourth place


-- =============================================================================
-- END OF SEED DATA
-- =============================================================================
