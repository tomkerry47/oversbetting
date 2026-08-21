-- A date/kickoff slot represents one round. This prevents a numbering-rule
-- change from creating a second active round for the same set of fixtures.
CREATE UNIQUE INDEX IF NOT EXISTS weeks_target_slot_unique
ON weeks (target_date, target_kickoff_time, is_custom);
