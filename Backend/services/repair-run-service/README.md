# Repair run service

The repair run service is the query-optimized audit projection for Temporal repair workflows. It
stores run metadata and an append-only event timeline. Incident-service remains the source of truth
for incident state; Temporal remains the source of truth for orchestration and retry history.

The Go module follows the repository's Clean Architecture convention:

- internal/domain contains repair-run and event models.
- internal/application contains validation, status transitions, metadata policy, and persistence
  contracts.
- internal/postgres implements idempotent persistence and keyset pagination.
- internal/api owns HTTP, validation mapping, authentication, rate admission, and safe errors.
- cmd/repair-run-service is the composition root.

## API

All /api/v1 routes require an internal bearer token when API_AUTH_ENABLED=true.

| Method and route | Purpose |
| --- | --- |
| POST /api/v1/repair-runs | Idempotently create a run by repairRunId |
| GET /api/v1/repair-runs/{repairRunID} | Read one run |
| GET /api/v1/repair-runs | Filter and keyset-list runs |
| POST /api/v1/repair-runs/{repairRunID}/events | Append an idempotent event and optionally advance status |
| GET /api/v1/repair-runs/{repairRunID}/events | Read ordered events after an event ID |
| PATCH /api/v1/repair-runs/{repairRunID} | Update a run using expectedVersion |
| GET /health | Liveness |
| GET /ready | PostgreSQL readiness |
| GET /metrics | Prometheus counters |

Run-list filters are incidentId, status, repository=owner/name, from, to, limit, and opaque cursor.
Event-list filters are afterId and limit. Limits default to 50 and cannot exceed 100.

Event metadata is allowlisted and capped at 16 KiB. It may contain safe summaries, harness/model
identity, changed paths, check names, policy version, and pull-request metadata. Prompts, source
files, raw logs, credentials, and arbitrary keys are rejected.

## Local setup

Apply migrations before starting the service:

~~~powershell
docker compose up -d postgres
$env:DATABASE_URL = "postgres://sre_agent:sre_agent_local@localhost:5432/sre_agent?sslmode=disable"
Get-ChildItem migrations -Filter *.sql | Sort-Object Name | ForEach-Object {
  docker compose exec -T postgres psql -U sre_agent -d sre_agent -v ON_ERROR_STOP=1 -f -
}
~~~

For isolated local development, the root Compose file includes the service. Production deploys the
migration image as a pre-deployment Job and must complete it before rolling out this service.

## Validation

~~~powershell
go vet ./...
go test ./...
~~~

The PostgreSQL integration test runs when TEST_DATABASE_URL is set. The migration is safe to
reapply to an empty or already initialized database.
