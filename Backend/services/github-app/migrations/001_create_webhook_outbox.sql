CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
    delivery_id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    action_name TEXT NOT NULL DEFAULT '',
    payload_sha256 CHAR(64) NOT NULL,
    installation_id BIGINT NOT NULL DEFAULT 0,
    repository TEXT NOT NULL DEFAULT '',
    repair_run_id TEXT NOT NULL DEFAULT '',
    pull_request_number INTEGER NOT NULL DEFAULT 0,
    merged BOOLEAN NOT NULL DEFAULT FALSE,
    merge_commit_sha TEXT NOT NULL DEFAULT '',
    head_commit_sha TEXT NOT NULL DEFAULT '',
    review_state TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'pending' CONSTRAINT github_webhook_deliveries_state_check CHECK (state IN ('pending', 'processing', 'processed', 'dead')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_owner TEXT NOT NULL DEFAULT '',
    lease_until TIMESTAMPTZ,
    last_error_code TEXT NOT NULL DEFAULT '',
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE github_webhook_deliveries
    ADD COLUMN IF NOT EXISTS head_commit_sha TEXT NOT NULL DEFAULT '';
ALTER TABLE github_webhook_deliveries
    DROP CONSTRAINT IF EXISTS github_webhook_deliveries_state_check;
ALTER TABLE github_webhook_deliveries
    ADD CONSTRAINT github_webhook_deliveries_state_check CHECK (state IN ('pending', 'processing', 'processed', 'dead'));

CREATE INDEX IF NOT EXISTS github_webhook_outbox_ready_idx
    ON github_webhook_deliveries (next_attempt_at, received_at)
    WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS github_webhook_outbox_expired_lease_idx
    ON github_webhook_deliveries (lease_until)
    WHERE state = 'processing';

CREATE TABLE IF NOT EXISTS github_installation_state (
    installation_id BIGINT PRIMARY KEY,
    active BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
