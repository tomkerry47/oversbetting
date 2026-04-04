ALTER TABLE weeks
ADD COLUMN IF NOT EXISTS target_date DATE,
ADD COLUMN IF NOT EXISTS target_kickoff_time TIME,
ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE weeks
SET
  target_date = COALESCE(target_date, saturday_date),
  target_kickoff_time = COALESCE(target_kickoff_time, TIME '15:00:00')
WHERE target_date IS NULL OR target_kickoff_time IS NULL;

ALTER TABLE weeks
ALTER COLUMN target_date SET NOT NULL;

ALTER TABLE weeks
ALTER COLUMN target_kickoff_time SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'weeks_season_week_number_is_custom_key'
  ) THEN
    ALTER TABLE weeks
    ADD CONSTRAINT weeks_season_week_number_is_custom_key
    UNIQUE (season, week_number, is_custom);
  END IF;
END $$;
