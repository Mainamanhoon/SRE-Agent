package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/repair-run-service/internal/application"
	"github.com/sre-agent/repair-run-service/internal/domain"
)

var (
	_          application.RepairRunRepository = (*RepairRunRepositoryV1)(nil)
	runColumns                                 = `id, incident_id::text, repository_owner, repository_name,
	expected_commit, toolchain, status, started_at, updated_at, completed_at, version,
	diagnosis_summary, abstention_reason, failure_code, sandbox_id, pull_request_url,
	COALESCE(pull_request_number, 0), verification_summary, harness, model, policy_version`
)

type RepairRunRepositoryV1 struct{ pool *pgxpool.Pool }

func NewRepairRunRepositoryV1(pool *pgxpool.Pool) *RepairRunRepositoryV1 {
	return &RepairRunRepositoryV1{pool: pool}
}

func (repository *RepairRunRepositoryV1) Ping(ctx context.Context) error {
	return repository.pool.Ping(ctx)
}

func (repository *RepairRunRepositoryV1) Create(ctx context.Context, input domain.CreateInput) (domain.RepairRun, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.RepairRun{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	statement := `INSERT INTO repair_runs (
	id, incident_id, repository_owner, repository_name, expected_commit, toolchain, started_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
ON CONFLICT (id) DO UPDATE SET id = repair_runs.id
WHERE repair_runs.incident_id = EXCLUDED.incident_id
  AND repair_runs.repository_owner = EXCLUDED.repository_owner
  AND repair_runs.repository_name = EXCLUDED.repository_name
  AND repair_runs.expected_commit = EXCLUDED.expected_commit
  AND repair_runs.toolchain = EXCLUDED.toolchain
RETURNING ` + runColumns
	run, err := scanRun(tx.QueryRow(ctx, statement, input.ID, input.IncidentID, input.RepositoryOwner,
		input.RepositoryName, input.ExpectedCommit, input.Toolchain, input.Now))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.RepairRun{}, application.ErrIdempotencyConflict
	}
	if err != nil {
		return domain.RepairRun{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO repair_run_events (
		repair_run_id, event_type, stage, outcome, status, occurred_at, metadata, idempotency_key
	) VALUES ($1, 'run_created', 'queued', 'accepted', 'queued', $2, '{}'::jsonb, 'repair-run-created-v1')
	ON CONFLICT (repair_run_id, idempotency_key) DO NOTHING`, input.ID, input.Now)
	if err != nil {
		return domain.RepairRun{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.RepairRun{}, err
	}
	return run, nil
}

func (repository *RepairRunRepositoryV1) Get(ctx context.Context, id string) (domain.RepairRun, error) {
	run, err := scanRun(repository.pool.QueryRow(ctx, `SELECT `+runColumns+` FROM repair_runs WHERE id=$1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.RepairRun{}, application.ErrNotFound
	}
	return run, err
}

func (repository *RepairRunRepositoryV1) List(ctx context.Context, query domain.ListQuery) (domain.RunPage, error) {
	var cursorTime any
	var cursorID any
	if query.CursorTime != nil {
		cursorTime, cursorID = *query.CursorTime, query.CursorID
	}
	var from, to any
	if query.From != nil {
		from = *query.From
	}
	if query.To != nil {
		to = *query.To
	}
	owner, name := "", ""
	if query.Repository != "" {
		parts := strings.SplitN(query.Repository, "/", 2)
		owner, name = parts[0], parts[1]
	}
	statement := `SELECT ` + runColumns + ` FROM repair_runs
WHERE ($1 = '' OR incident_id::text = $1)
  AND ($2 = '' OR status = $2)
  AND ($3 = '' OR (lower(repository_owner) = $3 AND lower(repository_name) = $4))
  AND ($5::timestamptz IS NULL OR started_at >= $5)
  AND ($6::timestamptz IS NULL OR started_at <= $6)
  AND ($7::timestamptz IS NULL OR (started_at, id) < ($7, $8))
ORDER BY started_at DESC, id DESC
LIMIT $9`
	rows, err := repository.pool.Query(ctx, statement, query.IncidentID, query.Status,
		strings.ToLower(owner), strings.ToLower(name), from, to, cursorTime, cursorID, query.Limit+1)
	if err != nil {
		return domain.RunPage{}, err
	}
	defer rows.Close()
	items := make([]domain.RepairRun, 0, query.Limit+1)
	for rows.Next() {
		run, scanErr := scanRun(rows)
		if scanErr != nil {
			return domain.RunPage{}, scanErr
		}
		items = append(items, run)
	}
	return domain.RunPage{Items: items}, rows.Err()
}

func (repository *RepairRunRepositoryV1) AppendEvent(ctx context.Context, input domain.AppendEventInput) (domain.RunEvent, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.RunEvent{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	existing, err := scanEvent(tx.QueryRow(ctx, `SELECT id, repair_run_id, event_type, stage, outcome,
		status, occurred_at, metadata, idempotency_key FROM repair_run_events
		WHERE repair_run_id=$1 AND idempotency_key=$2`, input.RepairRunID, input.IdempotencyKey))
	if err == nil {
		if !sameEvent(existing, input) {
			return domain.RunEvent{}, application.ErrIdempotencyConflict
		}
		return existing, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return domain.RunEvent{}, err
	}

	var currentStatus string
	err = tx.QueryRow(ctx, `SELECT status FROM repair_runs WHERE id=$1 FOR UPDATE`, input.RepairRunID).Scan(&currentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.RunEvent{}, application.ErrNotFound
	}
	if err != nil {
		return domain.RunEvent{}, err
	}
	if input.Status != "" {
		if err = application.ValidateTransition(currentStatus, input.Status); err != nil {
			return domain.RunEvent{}, err
		}
	}

	const insert = `INSERT INTO repair_run_events (
		repair_run_id, event_type, stage, outcome, status, metadata, idempotency_key
	) VALUES ($1,$2,$3,$4,$5,$6,$7)
	ON CONFLICT (repair_run_id, idempotency_key) DO NOTHING
	RETURNING id, repair_run_id, event_type, stage, outcome, status, occurred_at, metadata, idempotency_key`
	event, err := scanEvent(tx.QueryRow(ctx, insert, input.RepairRunID, input.EventType, input.Stage,
		input.Outcome, input.Status, input.Metadata, input.IdempotencyKey))
	if errors.Is(err, pgx.ErrNoRows) {
		event, err = scanEvent(tx.QueryRow(ctx, `SELECT id, repair_run_id, event_type, stage, outcome,
			status, occurred_at, metadata, idempotency_key FROM repair_run_events
			WHERE repair_run_id=$1 AND idempotency_key=$2`, input.RepairRunID, input.IdempotencyKey))
		if err == nil && !sameEvent(event, input) {
			return domain.RunEvent{}, application.ErrIdempotencyConflict
		}
		if err == nil {
			return event, tx.Commit(ctx)
		}
	}
	if err != nil {
		return domain.RunEvent{}, err
	}
	newStatus := input.Status
	if newStatus == "" {
		newStatus = currentStatus
	}
	_, err = tx.Exec(ctx, `UPDATE repair_runs SET status=$2, updated_at=NOW(),
		completed_at=CASE WHEN $2 IN ('resolved','ignored','failed','abstained')
			THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
		version=version+1,
		diagnosis_summary=COALESCE(NULLIF($3::jsonb->>'summary',''),diagnosis_summary),
		abstention_reason=CASE WHEN $2='abstained' THEN COALESCE(NULLIF($3::jsonb->>'summary',''),NULLIF($3::jsonb->>'reasonCode',''),abstention_reason) ELSE abstention_reason END,
		failure_code=CASE WHEN $2='failed' THEN COALESCE(NULLIF($3::jsonb->>'failureCode',''),NULLIF($3::jsonb->>'reasonCode',''),failure_code) ELSE failure_code END,
		sandbox_id=COALESCE(NULLIF($3::jsonb->>'sandboxId',''),sandbox_id),
		pull_request_url=COALESCE(NULLIF($3::jsonb->>'pullRequestUrl',''),pull_request_url),
		pull_request_number=CASE WHEN $3::jsonb->>'pullRequestNumber' ~ '^[0-9]{1,9}$' THEN (($3::jsonb->>'pullRequestNumber')::integer) ELSE pull_request_number END,
		verification_summary=CASE WHEN $2='verified' THEN COALESCE(NULLIF($3::jsonb->>'summary',''),NULLIF($3::jsonb->>'verificationStatus',''),verification_summary) ELSE verification_summary END,
		harness=COALESCE(NULLIF($3::jsonb->>'harness',''),harness),
		model=COALESCE(NULLIF($3::jsonb->>'model',''),model),
		policy_version=COALESCE(NULLIF($3::jsonb->>'policyVersion',''),policy_version)
		WHERE id=$1`, input.RepairRunID, newStatus, input.Metadata)
	if err != nil {
		return domain.RunEvent{}, err
	}
	return event, tx.Commit(ctx)
}

func (repository *RepairRunRepositoryV1) ListEvents(ctx context.Context, id string, afterID int64, limit int) (domain.EventPage, error) {
	rows, err := repository.pool.Query(ctx, `SELECT id, repair_run_id, event_type, stage, outcome,
		status, occurred_at, metadata, idempotency_key FROM repair_run_events
		WHERE repair_run_id=$1 AND id>$2 ORDER BY id ASC LIMIT $3`, id, afterID, limit+1)
	if err != nil {
		return domain.EventPage{}, err
	}
	defer rows.Close()
	items := make([]domain.RunEvent, 0, limit+1)
	for rows.Next() {
		event, scanErr := scanEvent(rows)
		if scanErr != nil {
			return domain.EventPage{}, scanErr
		}
		items = append(items, event)
	}
	if err = rows.Err(); err != nil {
		return domain.EventPage{}, err
	}
	if len(items) == 0 {
		var exists bool
		if err = repository.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_runs WHERE id=$1)`, id).Scan(&exists); err != nil {
			return domain.EventPage{}, err
		}
		if !exists {
			return domain.EventPage{}, application.ErrNotFound
		}
	}
	page := domain.EventPage{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		page.NextCursor = page.Items[len(page.Items)-1].ID
	}
	return page, nil
}

func (repository *RepairRunRepositoryV1) Update(ctx context.Context, input domain.UpdateInput) (domain.RepairRun, error) {
	tx, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.RepairRun{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var currentStatus string
	var version int64
	err = tx.QueryRow(ctx, `SELECT status, version FROM repair_runs WHERE id=$1 FOR UPDATE`, input.ID).Scan(&currentStatus, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.RepairRun{}, application.ErrNotFound
	}
	if err != nil {
		return domain.RepairRun{}, err
	}
	if version != input.ExpectedVersion {
		return domain.RepairRun{}, application.ErrConcurrentUpdate
	}
	status := input.Status
	if status == "" {
		status = currentStatus
	} else if err = application.ValidateTransition(currentStatus, status); err != nil {
		return domain.RepairRun{}, err
	}
	statement := `UPDATE repair_runs SET status=$2,
	updated_at=NOW(),
	completed_at=CASE WHEN $2 IN ('resolved','ignored','failed','abstained')
		THEN COALESCE(completed_at,NOW()) ELSE NULL END,
	version=version+1,
	diagnosis_summary=COALESCE($3,diagnosis_summary),
	abstention_reason=COALESCE($4,abstention_reason),
	failure_code=COALESCE($5,failure_code),
	sandbox_id=COALESCE($6,sandbox_id),
	pull_request_url=COALESCE($7,pull_request_url),
	pull_request_number=COALESCE($8,pull_request_number),
	verification_summary=COALESCE($9,verification_summary),
	harness=COALESCE($10,harness),
	model=COALESCE($11,model),
	policy_version=COALESCE($12,policy_version)
	WHERE id=$1 AND version=$13 RETURNING ` + runColumns
	run, err := scanRun(tx.QueryRow(ctx, statement, input.ID, status,
		input.DiagnosisSummary, input.AbstentionReason, input.FailureCode, input.SandboxID,
		input.PullRequestURL, input.PullRequestNumber, input.VerificationSummary,
		input.Harness, input.Model, input.PolicyVersion, input.ExpectedVersion))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.RepairRun{}, application.ErrConcurrentUpdate
	}
	if err != nil {
		return domain.RepairRun{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.RepairRun{}, err
	}
	return run, nil
}

type scanner interface{ Scan(...any) error }

func scanRun(row scanner) (domain.RepairRun, error) {
	var run domain.RepairRun
	err := row.Scan(&run.ID, &run.IncidentID, &run.RepositoryOwner, &run.RepositoryName,
		&run.ExpectedCommit, &run.Toolchain, &run.Status, &run.StartedAt, &run.UpdatedAt,
		&run.CompletedAt, &run.Version, &run.DiagnosisSummary, &run.AbstentionReason,
		&run.FailureCode, &run.SandboxID, &run.PullRequestURL, &run.PullRequestNumber,
		&run.VerificationSummary, &run.Harness, &run.Model, &run.PolicyVersion)
	return run, err
}

func scanEvent(row scanner) (domain.RunEvent, error) {
	var event domain.RunEvent
	err := row.Scan(&event.ID, &event.RepairRunID, &event.EventType, &event.Stage,
		&event.Outcome, &event.Status, &event.OccurredAt, &event.Metadata, &event.IdempotencyKey)
	return event, err
}

func sameEvent(existing domain.RunEvent, input domain.AppendEventInput) bool {
	var existingMetadata, inputMetadata any
	if json.Unmarshal(existing.Metadata, &existingMetadata) != nil || json.Unmarshal(input.Metadata, &inputMetadata) != nil {
		return false
	}
	return existing.EventType == input.EventType && existing.Stage == input.Stage &&
		existing.Outcome == input.Outcome && existing.Status == input.Status &&
		reflect.DeepEqual(existingMetadata, inputMetadata)
}
