# GitHub App service

This service is the sole GitHub mutation boundary. Internal callers authenticate with a bearer token; GitHub webhooks use `X-Hub-Signature-256`. A `GitHubGateway` interface separates application policy from the REST implementation and an `InstallationTokenProvider` isolates GitHub App JWT/token exchange.

It provides bounded source archives for isolated sandboxes and creates file blobs, a tree, a commit, a deterministic repair branch, and a draft pull request. A repeated `repairRunId` resolves the existing branch/PR instead of creating duplicates.

Verified webhooks are normalized, hashed, and durably inserted into PostgreSQL before returning `202`. The outbox stores only bounded event metadata and a SHA-256 payload hash, never the raw body. Delivery IDs are unique; a same-ID/same-payload replay is acknowledged as a duplicate, while same-ID/different-payload requests are rejected. A lease-based worker retries transient projection/incident-service failures. Pull-request outcomes are correlated only through the server-generated `sre-agent/repair-<run-id>` branch and verified against the repair run's repository and PR number before effects are applied. Merge resolves the run and incident; an unmerged close marks them failed; ready/draft changes append review events. Installation delete/suspend events mark the installation unavailable in PostgreSQL and all service replicas check that state before using cached installation tokens.

Apply `migrations/*.sql` before starting the service. Production must run `Dockerfile.migrate` as a completed pre-deployment Job. `DATABASE_URL`, `REPAIR_RUN_SERVICE_URL`, and `INCIDENT_SERVICE_URL` are required service configuration; the internal bearer token is shared only between services.

Required configuration: `GITHUB_APP_ID`, either `GITHUB_APP_PRIVATE_KEY_PEM` or `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`, and `API_AUTH_TOKEN`.
