-- Migration 006: Add throws_first_id to matches
-- Records which player throws first in each match, randomly assigned
-- when both players are determined (status transitions to 'ready').

ALTER TABLE matches
  ADD COLUMN throws_first_id UUID REFERENCES players(id) ON DELETE SET NULL;
