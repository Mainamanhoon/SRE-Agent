# Control API

The control API is the authenticated north-south façade for incident submission, incident reads, and agent diagnosis. Its application layer depends on replaceable contracts:

- `ControlPlaneGateway` owns downstream commands and queries; `FetchControlPlaneGatewayV1` is the HTTP implementation.
- `ControlPlaneReadinessProbe` owns dependency health; `ConfiguredControlPlaneReadinessProbeV1` checks the detector, incident service, Temporal, and optionally the agent runner.
- `RequestAuthenticator` owns API authentication; `BearerTokenRequestAuthenticatorV1` accepts the external API token and the distinct internal service token.
- `RequestRateLimiter` owns ingress admission; `TokenBucketRequestRateLimiterV1` provides per-replica limits.

Routes:

| Route | Purpose |
| --- | --- |
| `GET /api/v1/health` | Service identity/liveness compatibility route |
| `GET /api/v1/health/live` | Process liveness |
| `GET /api/v1/health/ready` | Required dependency readiness |
| `GET /api/v1/system` | Service topology used by diagnostic tools |
| `POST /api/v1/incidents/candidates` | Validate and submit a detector candidate |
| `GET /api/v1/incidents/:incidentId` | Read a persisted incident |
| `POST /api/v1/diagnoses` | Invoke the agent-runner diagnosis boundary |

Production configuration fails closed unless API authentication is enabled and both tokens contain at least 32 characters. `AGENT_RUNNER_REQUIRED` may remain `false` for the local stack without the optional agent profile; set it to `true` in a complete production deployment. Downstream calls have independent timeouts and bounded response bodies. The rate limiter is intentionally replaceable by an edge or distributed implementation when a global cross-replica limit is required.
