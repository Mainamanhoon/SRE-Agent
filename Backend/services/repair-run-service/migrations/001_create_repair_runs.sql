CREATE TABLE IF NOT EXISTS repair_runs (
  id TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 63),
  incident_id UUID NOT NULL,
  repository_owner TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  expected_commit TEXT NOT NULL,
  toolchain TEXT NOT NULL CHECK (toolchain IN ('node', 'go')),
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  diagnosis_summary TEXT NOT NULL DEFAULT '',
  abstention_reason TEXT NOT NULL DEFAULT '',
  failure_code TEXT NOT NULL DEFAULT '',
  sandbox_id TEXT NOT NULL DEFAULT '',
  pull_request_url TEXT NOT NULL DEFAULT '',
  pull_request_number INTEGER,
  verification_summary TEXT NOT NULL DEFAULT '',
  harness TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  policy_version TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS repair_runs_incident_started_idx
  ON repair_runs (incident_id, started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS repair_runs_status_started_idx
  ON repair_runs (status, started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS repair_runs_repository_started_idx
  ON repair_runs (repository_owner, repository_name, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS repair_run_events (
  id BIGSERIAL PRIMARY KEY,
  repair_run_id TEXT NOT NULL REFERENCES repair_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stage TEXT NOT NULL,
  outcome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(metadata::text) <= 16384),
  idempotency_key TEXT NOT NULL,
  UNIQUE (repair_run_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS repair_run_events_run_id_idx
  ON repair_run_events (repair_run_id, id);
