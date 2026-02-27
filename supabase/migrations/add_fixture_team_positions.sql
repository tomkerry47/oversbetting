ALTER TABLE fixtures
ADD COLUMN IF NOT EXISTS home_team_position INT,
ADD COLUMN IF NOT EXISTS away_team_position INT;

CREATE INDEX IF NOT EXISTS idx_fixtures_week_home_pos ON fixtures(week_id, home_team_position);
CREATE INDEX IF NOT EXISTS idx_fixtures_week_away_pos ON fixtures(week_id, away_team_position);
