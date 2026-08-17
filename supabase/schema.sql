-- ============================================================
-- Betting Overs - Supabase Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- WEEKS: Tracks each Saturday game week
-- ============================================================
CREATE TABLE weeks (
  id              SERIAL PRIMARY KEY,
  week_number     INT NOT NULL,
  season          TEXT NOT NULL DEFAULT '2025-26',
  saturday_date   DATE NOT NULL,
  target_date     DATE NOT NULL,
  target_kickoff_time TIME NOT NULL DEFAULT '15:00:00',
  is_custom       BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed')),
  rapidapi_request_budget INT,
  rapidapi_requests_used INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season, week_number, is_custom)
);

CREATE INDEX idx_weeks_saturday_date ON weeks(saturday_date);

-- ============================================================
-- FIXTURES: Saturday 15:00 fixtures from the API
-- ============================================================
CREATE TABLE fixtures (
  id              SERIAL PRIMARY KEY,
  api_fixture_id  BIGINT NOT NULL,
  data_provider   TEXT NOT NULL DEFAULT 'sofascore',
  provider_fixture_id BIGINT NOT NULL,
  bsd_event_id    BIGINT,
  week_id         INT NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  home_team       TEXT NOT NULL,
  away_team       TEXT NOT NULL,
  home_team_logo  TEXT,
  away_team_logo  TEXT,
  league_name     TEXT NOT NULL,
  league_id       INT NOT NULL,
  home_team_position INT,
  away_team_position INT,
  kick_off        TIMESTAMPTZ NOT NULL,
  home_score      INT,
  away_score      INT,
  match_status    TEXT NOT NULL DEFAULT 'NS',
  over_25_prediction DOUBLE PRECISION,
  bsd_live_websocket BOOLEAN NOT NULL DEFAULT FALSE,
  bsd_websocket_plus BOOLEAN NOT NULL DEFAULT FALSE,
  live_updated_at TIMESTAMPTZ,
  is_star_pick    BOOLEAN NOT NULL DEFAULT FALSE,
  star_rank       INT,
  star_score      DOUBLE PRECISION,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fixtures_week ON fixtures(week_id);
CREATE INDEX idx_fixtures_api_id ON fixtures(api_fixture_id);
CREATE INDEX idx_fixtures_week_star_pick ON fixtures(week_id, is_star_pick);
CREATE UNIQUE INDEX fixtures_provider_fixture_unique ON fixtures(data_provider, provider_fixture_id);
CREATE UNIQUE INDEX fixtures_bsd_event_unique ON fixtures(bsd_event_id) WHERE bsd_event_id IS NOT NULL;

-- ============================================================
-- SELECTIONS: Each player's 2 picks per week
-- ============================================================
CREATE TABLE selections (
  id              SERIAL PRIMARY KEY,
  week_id         INT NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  player_name     TEXT NOT NULL
                    CHECK (player_name IN ('Kezza', 'Mikey', 'Krissy', 'Tommy')),
  fixture_id      INT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  result          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (result IN ('pending', 'won', 'lost')),
  total_goals     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_id, player_name, fixture_id)
);

CREATE INDEX idx_selections_week ON selections(week_id);
CREATE INDEX idx_selections_player ON selections(player_name);

-- ============================================================
-- FINES: Track monetary fines per player
-- ============================================================
CREATE TABLE fines (
  id              SERIAL PRIMARY KEY,
  week_id         INT NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  player_name     TEXT NOT NULL
                    CHECK (player_name IN ('Kezza', 'Mikey', 'Krissy', 'Tommy')),
  amount          DECIMAL(10,2) NOT NULL,
  reason          TEXT NOT NULL,
  fixture_id      INT REFERENCES fixtures(id) ON DELETE SET NULL,
  cleared         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fines_player ON fines(player_name);
CREATE INDEX idx_fines_week ON fines(week_id);

-- ============================================================
-- ROW LEVEL SECURITY (allow public read/write for simplicity)
-- ============================================================
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE fines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on weeks" ON weeks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on fixtures" ON fixtures FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on selections" ON selections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on fines" ON fines FOR ALL USING (true) WITH CHECK (true);
