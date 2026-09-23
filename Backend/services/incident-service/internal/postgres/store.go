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

type IncidentRepositoryV1 struct {
	pool *pgxpool.Pool
}

func NewIncidentRepositoryV1(pool *pgxpool.Pool) *IncidentRepositoryV1 {
	return &IncidentRepositoryV1{pool: pool}
}

func (store *IncidentRepositoryV1) Ping(ctx context.Context) error {
	return store.pool.Ping(ctx)
}

func (store *IncidentRepositoryV1) Upsert(ctx context.Context, input domain.IncidentInput) (domain.Incident, error) {
	const query = `
INSERT INTO incidents (fingerprint, service_name, environment, severity, trace_id, error_summary)
VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''))
ON CONFLICT (fingerprint) DO UPDATE SET
  severity = EXCLUDED.severity,
  trace_id = COALESCE(EXCLUDED.trace_id, incidents.trace_id),
  error_summary = COALESCE(EXCLUDED.error_summary, incidents.error_summary),
  occurrence_count = incidents.occurrence_count + 1,
  last_seen_at = NOW(),
  updated_at = NOW()
RETURNING id::text, fingerprint, service_name, environment, severity, status,
          COALESCE(trace_id, ''), COALESCE(error_summary, ''), occurrence_count,
          first_seen_at, last_seen_at`

	var incident domain.Incident
	err := store.pool.QueryRow(ctx, query,
		input.Fingerprint,
		input.Service,
		input.Environment,
		input.Severity,
		input.TraceID,
		input.ErrorSummary,
	).Scan(
		&incident.ID,
		&incident.Fingerprint,
		&incident.Service,
		&incident.Environment,
		&incident.Severity,
		&incident.Status,
		&incident.TraceID,
		&incident.ErrorSummary,
		&incident.OccurrenceCount,
		&incident.FirstSeenAt,
		&incident.LastSeenAt,
	)
	return incident, err
}

func (store *IncidentRepositoryV1) FindByID(ctx context.Context, incidentID string) (domain.Incident, error) {
	const query = `
SELECT id::text, fingerprint, service_name, environment, severity, status,
       COALESCE(trace_id, ''), COALESCE(error_summary, ''), occurrence_count,
       first_seen_at, last_seen_at
FROM incidents
WHERE id = $1`

	var incident domain.Incident
	err := store.pool.QueryRow(ctx, query, incidentID).Scan(
		&incident.ID,
		&incident.Fingerprint,
		&incident.Service,
		&incident.Environment,
		&incident.Severity,
		&incident.Status,
		&incident.TraceID,
		&incident.ErrorSummary,
		&incident.OccurrenceCount,
		&incident.FirstSeenAt,
		&incident.LastSeenAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Incident{}, application.ErrIncidentNotFound
	}
	return incident, err
}
