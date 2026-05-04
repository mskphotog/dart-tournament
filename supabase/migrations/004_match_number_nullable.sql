-- Migration 004: Allow match_number to be NULL
-- 
-- Reason: Loser's Bracket bye matches (single-feeder matches where only one
-- player can ever arrive) auto-complete and don't need a play-order number
-- since they aren't actually played. The match_number column was previously
-- NOT NULL, which prevented inserting these auto-advance bye matches.

ALTER TABLE matches ALTER COLUMN match_number DROP NOT NULL;
