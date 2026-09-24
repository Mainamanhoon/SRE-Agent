# Incident service

The incident service owns durable incident identity and lifecycle state. It deduplicates by fingerprint while appending an immutable occurrence for every observation, supports bounded keyset pagination and filters, and updates status with optimistic concurrency through `IncidentStatusPolicy`.

Inbound operations require bearer authentication when enabled and are body-bounded, rate-limited, panic-isolated, and instrumented. Production startup fails closed without a 32-character token. PostgreSQL pool sizes and connection lifetime are configurable.

Build `Dockerfile.migrate` and run that image as a deployment migration Job before rolling out the service. Migrations are idempotent. `TEST_DATABASE_URL` enables the repository integration test; otherwise that test skips without hiding the unit suite.
