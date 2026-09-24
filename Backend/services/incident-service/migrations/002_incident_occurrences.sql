CREATE TABLE IF NOT EXISTS incident_occurrences (
  id BIGSERIAL PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  trace_id TEXT,
  error_summary TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incident_occurrences_incident_observed_idx
  ON incident_occurrences (incident_id, observed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS incidents_status_last_seen_id_idx
  ON incidents (status, last_seen_at DESC, id DESC);
