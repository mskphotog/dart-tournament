-- Migration 007: Make game_type_id nullable on tournaments
-- Game type is now selected after seeding via the #1 seed modal,
-- not at tournament creation time.

ALTER TABLE tournaments
  ALTER COLUMN game_type_id DROP NOT NULL;
