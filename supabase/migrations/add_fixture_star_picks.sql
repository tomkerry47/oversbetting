ALTER TABLE fixtures
ADD COLUMN IF NOT EXISTS is_star_pick BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS star_rank INT,
ADD COLUMN IF NOT EXISTS star_score DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_fixtures_week_star_pick ON fixtures(week_id, is_star_pick);
