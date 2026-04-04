DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'weeks_saturday_date_key'
  ) THEN
    ALTER TABLE weeks
    DROP CONSTRAINT weeks_saturday_date_key;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weeks_saturday_date ON weeks(saturday_date);
