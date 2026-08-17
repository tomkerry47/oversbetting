-- Provider-aware fixture identifiers and BSD prediction/live metadata.
ALTER TABLE fixtures
  ADD COLUMN IF NOT EXISTS data_provider TEXT NOT NULL DEFAULT 'sofascore',
  ADD COLUMN IF NOT EXISTS provider_fixture_id BIGINT,
  ADD COLUMN IF NOT EXISTS bsd_event_id BIGINT,
  ADD COLUMN IF NOT EXISTS over_25_prediction DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS bsd_live_websocket BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bsd_websocket_plus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS live_updated_at TIMESTAMPTZ;

ALTER TABLE fixtures ALTER COLUMN api_fixture_id TYPE BIGINT;

UPDATE fixtures SET provider_fixture_id = api_fixture_id
WHERE provider_fixture_id IS NULL;

ALTER TABLE fixtures ALTER COLUMN provider_fixture_id SET NOT NULL;
ALTER TABLE fixtures DROP CONSTRAINT IF EXISTS fixtures_api_fixture_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS fixtures_provider_fixture_unique
  ON fixtures (data_provider, provider_fixture_id);
CREATE UNIQUE INDEX IF NOT EXISTS fixtures_bsd_event_unique
  ON fixtures (bsd_event_id) WHERE bsd_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fixtures_provider_idx ON fixtures (data_provider);
