-- Add SofaScore team IDs to fixtures table for expandable details
ALTER TABLE fixtures 
ADD COLUMN home_team_id INT,
ADD COLUMN away_team_id INT;

-- Create indexes for performance
CREATE INDEX idx_fixtures_home_team_id ON fixtures(home_team_id);
CREATE INDEX idx_fixtures_away_team_id ON fixtures(away_team_id);
