# Incident detector

The detector validates and fingerprints exception candidates, then synchronously hands the normalized incident to the incident service. It returns `202` only after the incident service confirms durable persistence; exhausted transient failures return `503`, allowing the caller or durable workflow to retry safely.

The clean-architecture extension points are `CandidateDetector`, `FingerprintGenerator`, `CandidateSink`, `ReadinessProbe`, `RequestAuthenticator`, `RequestLimiter`, `CandidateMetrics`, and `Clock`. The current adapters use SHA-256 normalization, the incident-service HTTP API, constant-time bearer authentication, a per-replica token bucket, and Prometheus text metrics.

Routes:

| Route | Authentication | Purpose |
| --- | --- | --- |
| `GET /health` | none | Process liveness |
| `GET /ready` | none | Incident-service readiness |
| `GET /metrics` | network-policy protected | Prometheus candidate outcome counters |
| `POST /api/v1/candidates` | bearer token when enabled | Detect and persist a candidate |

Important configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Use `production` to enable fail-closed validation |
| `INCIDENT_SERVICE_URL` | `http://localhost:4020` | Durable incident store endpoint |
| `API_AUTH_ENABLED` | `false` | Must be `true` in production |
| `API_AUTH_TOKEN` | empty | Inbound token, minimum 32 characters when enabled |
| `INTERNAL_SERVICE_TOKEN` | empty | Outbound service token, minimum 32 characters in production |
| `REQUESTS_PER_SECOND` | `2000` | Per-replica steady-state admission rate |
| `REQUEST_BURST` | `4000` | Per-replica burst capacity |
| `DELIVERY_MAX_ATTEMPTS` | `3` | Bounded downstream attempts for transient failures |
| `DEPENDENCY_TIMEOUT` | `2s` | Incident-service request/readiness timeout |
| `REQUEST_TIMEOUT` | `10s` | HTTP server read/write timeout |
| `BODY_LIMIT_BYTES` | `1048576` | Candidate request-body limit |

The local limiter is not a global quota. Enforce tenant/global quotas at the ingress or replace `RequestLimiter` with a distributed adapter. Prometheus access should be restricted by cluster network policy.
