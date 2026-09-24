package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/incident-service/internal/application"
	"github.com/sre-agent/incident-service/internal/domain"
)

var (
	_ application.IncidentRepository = (*IncidentRepositoryV1)(nil)
	_ application.ReadinessProbe     = (*IncidentRepositoryV1)(nil)
)

type IncidentRepositoryV1 struct{ pool *pgxpool.Pool }

func NewIncidentRepositoryV1(pool *pgxpool.Pool) *IncidentRepositoryV1 {
	return &IncidentRepositoryV1{pool: pool}
}
func (store *IncidentRepositoryV1) Ping(ctx context.Context) error { return store.pool.Ping(ctx) }

func (store *IncidentRepositoryV1) Upsert(ctx context.Context, input domain.IncidentInput) (domain.Incident, error) {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Incident{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	const upsert = `
INSERT INTO incidents (fingerprint, service_name, environment, severity, trace_id, error_summary)
VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''))
ON CONFLICT (fingerprint) DO UPDATE SET
  severity = EXCLUDED.severity, trace_id = COALESCE(EXCLUDED.trace_id, incidents.trace_id),
  error_summary = COALESCE(EXCLUDED.error_summary, incidents.error_summary),
  occurrence_count = incidents.occurrence_count + 1, last_seen_at = NOW(), updated_at = NOW()
RETURNING id::text, fingerprint, service_name, environment, severity, status,
COALESCE(trace_id, ''), COALESCE(error_summary, ''), occurrence_count, first_seen_at, last_seen_at`
	incident, err := scanIncident(tx.QueryRow(ctx, upsert, input.Fingerprint, input.Service, input.Environment, input.Severity, input.TraceID, input.ErrorSummary))
	if err != nil {
		return domain.Incident{}, err
	}
	const occurrence = `INSERT INTO incident_occurrences (incident_id, severity, trace_id, error_summary) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))`
	if _, err = tx.Exec(ctx, occurrence, incident.ID, input.Severity, input.TraceID, input.ErrorSummary); err != nil {
		return domain.Incident{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.Incident{}, err
	}
	return incident, nil
}

func (store *IncidentRepositoryV1) FindByID(ctx context.Context, incidentID string) (domain.Incident, error) {
	const query = `SELECT id::text, fingerprint, service_name, environment, severity, status,
COALESCE(trace_id, ''), COALESCE(error_summary, ''), occurrence_count, first_seen_at, last_seen_at
FROM incidents WHERE id = $1`
	incident, err := scanIncident(store.pool.QueryRow(ctx, query, incidentID))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Incident{}, application.ErrIncidentNotFound
	}
	return incident, err
}

func (store *IncidentRepositoryV1) ListIncidents(ctx context.Context, query domain.IncidentListQuery) ([]domain.Incident, error) {
	const statement = `SELECT id::text, fingerprint, service_name, environment, severity, status,
COALESCE(trace_id, ''), COALESCE(error_summary, ''), occurrence_count, first_seen_at, last_seen_at
FROM incidents
WHERE ($1 = '' OR status = $1) AND ($2 = '' OR service_name = $2)
  AND ($3::timestamptz IS NULL OR (last_seen_at, id) < ($3::timestamptz, $4::uuid))
ORDER BY last_seen_at DESC, id DESC LIMIT $5`
	var before any
	var beforeID any
	if !query.BeforeLastSeen.IsZero() {
		before, beforeID = query.BeforeLastSeen, query.BeforeID
	}
	rows, err := store.pool.Query(ctx, statement, query.Status, query.Service, before, beforeID, query.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.Incident, 0, query.Limit)
	for rows.Next() {
		incident, scanErr := scanIncident(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, incident)
	}
	return items, rows.Err()
}

func (store *IncidentRepositoryV1) ListOccurrences(ctx context.Context, incidentID string, limit int) ([]domain.IncidentOccurrence, error) {
	const query = `SELECT id, incident_id::text, severity, COALESCE(trace_id, ''), COALESCE(error_summary, ''), observed_at
FROM incident_occurrences WHERE incident_id = $1 ORDER BY observed_at DESC, id DESC LIMIT $2`
	rows, err := store.pool.Query(ctx, query, incidentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.IncidentOccurrence, 0, limit)
	for rows.Next() {
		var item domain.IncidentOccurrence
		if err = rows.Scan(&item.ID, &item.IncidentID, &item.Severity, &item.TraceID, &item.ErrorSummary, &item.ObservedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *IncidentRepositoryV1) UpdateStatus(ctx context.Context, incidentID, current, next string) (domain.Incident, error) {
	const query = `UPDATE incidents SET status = $3, updated_at = NOW() WHERE id = $1 AND status = $2
RETURNING id::text, fingerprint, service_name, environment, severity, status,
COALESCE(trace_id, ''), COALESCE(error_summary, ''), occurrence_count, first_seen_at, last_seen_at`
	incident, err := scanIncident(store.pool.QueryRow(ctx, query, incidentID, current, next))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Incident{}, application.ErrConcurrentUpdate
	}
	return incident, err
}

type scanner interface{ Scan(...any) error }

func scanIncident(row scanner) (domain.Incident, error) {
	var incident domain.Incident
	err := row.Scan(&incident.ID, &incident.Fingerprint, &incident.Service, &incident.Environment,
		&incident.Severity, &incident.Status, &incident.TraceID, &incident.ErrorSummary,
		&incident.OccurrenceCount, &incident.FirstSeenAt, &incident.LastSeenAt)
	return incident, err
}
