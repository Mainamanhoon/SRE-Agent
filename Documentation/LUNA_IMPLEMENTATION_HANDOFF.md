# SRE Agent — implementation handoff for Luna

Last updated: 2026-09-24

This document is the execution guide for continuing the SRE Agent with a smaller or faster coding
model such as Luna. It is intentionally explicit. The model should not have to rediscover service
ownership, reverse-engineer architectural decisions, or guess what “production complete” means.

The current repository already contains the complete backend repair path:

    Detect -> persist -> diagnose -> create plan -> sandbox -> verify -> draft PR -> await review

The remaining work is mainly production acceptance, product-facing projections and UI, operational
hardening, webhook reconciliation, benchmarks, and scale validation. Do not replace the existing
services with new implementations merely because a task below introduces an additional capability.

---

## 1. Instructions for the implementation model

Before changing code, read these files in this order:

1. Documentation/LUNA_IMPLEMENTATION_HANDOFF.md
2. Documentation/FUNCTIONALITY_CATALOG.md
3. Backend/ARCHITECTURE.md
4. Documentation/DEVELOPMENT_GUIDE.md
5. The README of every service touched by the selected milestone
6. The existing contracts, implementation classes, tests, and composition root for that service

Then:

1. Run git status and preserve all existing user changes.
2. Select exactly one milestone or one bounded slice from this document.
3. Write or update the contract before its production adapter when a new replaceable dependency is
   needed.
4. Add tests with deterministic fakes at external boundaries.
5. Run the smallest relevant test suite, followed by the repository-wide checks named in section 15.
6. Update Documentation/FUNCTIONALITY_CATALOG.md:
   - change a status only when the stated evidence exists;
   - append a dated implementation-journal entry;
   - clearly distinguish Implemented from Verified.
7. Do not commit, push, deploy, create cloud resources, or use production credentials unless the
   user explicitly requests that operation.

Use this prompt when starting a new Luna session:

~~~text
Read Documentation/LUNA_IMPLEMENTATION_HANDOFF.md, Documentation/FUNCTIONALITY_CATALOG.md,
Backend/ARCHITECTURE.md, and the README for every service you will touch. Implement only
Milestone <number>, Slice <letter>. Preserve the existing Clean Architecture boundaries and
composition roots. Add deterministic tests, run the required validation commands, and append the
result with exact evidence to FUNCTIONALITY_CATALOG.md. Do not claim environment-dependent checks
passed unless you actually ran them. Do not commit or push unless I explicitly request it.
~~~

If a requested milestone is too large for one context window, complete one slice fully. Do not make
partially wired contracts, placeholder routes, TODO-only adapters, or empty interface layers.

---

## 2. Source-of-truth hierarchy

When documents disagree, use this priority:

1. Executable tests and current code
2. Documentation/FUNCTIONALITY_CATALOG.md
3. This handoff
4. Backend/ARCHITECTURE.md
5. Older roadmap documents

The older roadmap explains the product vision, but some milestones in it are already implemented.
Do not use the roadmap alone to decide that code is missing.

The words used in project documentation have precise meanings:

- Verified: implemented and exercised by an automated test or a documented live smoke test.
- Implemented: production code/configuration exists, but an environment-dependent check remains.
- Planned: accepted work with no complete implementation yet.
- Production-ready boundary: the code has safe contracts, configuration, tests, and deployment
  primitives.
- Production-certified system: the complete deployed system has passed live provider, GitHub,
  cluster, failure-recovery, security, and capacity tests. This certification is not complete yet.

---

## 3. Non-negotiable architecture rules

### 3.1 Clean Architecture

Dependencies point inward:

    presentation -> application -> domain
                       ^
                       |
                 infrastructure

- Domain contains business concepts and invariants. It must not import HTTP, database, Kubernetes,
  GitHub, Temporal, or model SDK packages.
- Application contains use cases and narrow contracts for capabilities it needs.
- Infrastructure implements those contracts.
- Presentation translates HTTP/transport data into application inputs and maps errors to responses.
- Composition roots create concrete implementations and inject them. Business code must not select
  an adapter by importing it directly.

### 3.2 SOLID and interface discipline

Use interfaces or abstract contracts for replaceable behavior, not for every data structure.

- Single Responsibility: one class or Go type owns one business responsibility.
- Open/Closed: add an adapter or policy implementation without editing unrelated use cases.
- Liskov Substitution: every implementation must honor the same error, cancellation, idempotency,
  timeout, and security semantics as the contract.
- Interface Segregation: use small capability-focused contracts. Do not build a giant service
  interface containing every possible future operation.
- Dependency Inversion: application code depends on contracts; infrastructure depends on SDKs.

Important correction: adding a method to a TypeScript interface or abstract class does not generate
method bodies automatically. It intentionally creates compiler errors in implementations until each
implementation is updated. Go behaves similarly through implicit interface satisfaction. Prefer one
of these choices:

1. Add a method to the existing contract only when every implementation must support it now.
2. Add a separate capability contract when support is optional.
3. Create a V2 contract beside V1 when semantics or request/response shapes are incompatible.
4. Adapt V1 to V2 at the composition boundary when a migration period is required.

### 3.3 Versioning pattern

Existing implementations use names such as RepairAgentHarness, DeepSeekRepairAgentHarnessV1, and
FetchRepairServiceGatewayV1. Continue this convention.

For a compatible new implementation:

    RepairAgentHarness
      -> DeepSeekRepairAgentHarnessV1
      -> OpenAIRepairAgentHarnessV1
      -> AnthropicRepairAgentHarnessV1

For an incompatible contract:

    RepairPlanParserV1 contract
    RepairPlanParserV2 contract
    V1ToV2RepairPlanAdapter

Do not create V2 merely because internal code was refactored. Version externally observable
semantics, serialized data, or incompatible contract behavior.

### 3.4 Composition and configuration

- Select implementations in the service composition root using validated configuration.
- Fail closed in production when credentials, tokens, URLs, runtime classes, or required adapters
  are missing.
- A test fake must never become an automatic production fallback.
- Configuration selects an implementation; request payloads must not select arbitrary classes,
  executables, commands, images, or endpoints.

### 3.5 Security boundary

- The agent runner is read-only.
- Model-accessible MCP tools are read-only.
- Repository mutation occurs only in the disposable sandbox executor.
- GitHub mutation occurs only through the GitHub App, called by the Temporal repair workflow.
- The model must never choose an arbitrary shell command. Verification commands come from
  project-owned, allowlisted profiles.
- Never commit API keys, GitHub private keys, bearer tokens, webhook secrets, database passwords, or
  kubeconfigs.
- Never print secrets in tests, logs, error messages, documentation, or command output.
- Treat every incident field, log line, source file, model response, archive, and webhook as
  untrusted input.

---

## 4. Current system map

| Component | Port | Ownership | Primary entry points |
| --- | ---: | --- | --- |
| Control API | 4000 | Public/internal facade, auth, admission, topology, workflow start/query | Backend/services/control-api/src/app.ts and src/presentation |
| Incident detector | 4010 | Candidate validation, normalization, fingerprinting, durable handoff | Backend/services/incident-detector/internal/application |
| Incident service | 4020 | PostgreSQL incident/occurrence truth and lifecycle policy | Backend/services/incident-service/internal/application and internal/postgres |
| Sandbox controller | 4030 | Kubernetes Job and task-Secret lifecycle | Backend/services/sandbox-controller/internal/application |
| Agent runner | 4040 | Harness-neutral diagnosis and read-only MCP tools | Backend/services/agent-runner/src/application and src/composition |
| GitHub App | 4050 | GitHub authentication, source archives, commits, branches, draft PRs | Backend/services/github-app/internal/application |
| Repair worker | 4060 health | Durable Temporal orchestration and downstream activity calls | Backend/services/repair-worker/src/workflows.ts and src/activities.ts |
| OTel collector | 4317/4318 | Telemetry receive, redact, queue, retry, and route | Backend/services/otel-collector/config.yaml |
| PostgreSQL | 5432 | Incident persistence and occurrence history | Managed dependency |
| Temporal | 7233 | Durable workflow history, retries, timers, and status query | Managed dependency |
| Prometheus | 9090 | Metric backend and bounded PromQL evidence | Local/deployed observability dependency |
| Loki | 3100 | Log backend and bounded LogQL evidence | Local/deployed observability dependency |
| Jaeger | 16686 | Trace backend and trace evidence | Local/deployed observability dependency |

### 4.1 Current request path

1. A monitoring source submits a candidate to the control API or incident detector.
2. The detector validates and normalizes the candidate, calculates a stable fingerprint, and retries
   delivery to the incident service.
3. The incident service deduplicates the active incident and appends an immutable occurrence.
4. A caller starts a repair with POST /api/v1/repairs on the control API.
5. The control API creates an idempotently named Temporal workflow.
6. The repair worker triages the incident and moves it to investigating.
7. The agent runner gathers bounded evidence with read-only tools and asks the configured harness for
   a strict JSON repair plan.
8. The worker validates the plan and changes the incident to repairing.
9. The GitHub App provides a bounded archive for the exact repository commit.
10. The sandbox controller creates an idempotent Kubernetes Job using the fixed Node or Go executor.
11. The executor safely extracts the archive, applies explicit file replacements/deletions, runs the
    fixed verification profile, and emits a bounded structured result.
12. Only a successful verified result is sent to the GitHub App.
13. The GitHub App creates blobs, a tree, a commit, a deterministic branch, and an idempotent draft
    pull request.
14. The incident moves to awaiting_review.
15. The workflow deletes its sandbox in a non-cancellable cleanup step.

### 4.2 Incident lifecycle

The current lifecycle includes:

    open
      -> investigating
      -> repairing
      -> awaiting_review
      -> resolved

Terminal or alternate outcomes include ignored, failed, and abstained. The incident service owns
transition validity. Other services request transitions but must not duplicate transition rules.

### 4.3 Repair-plan contract

The diagnosis output is strict JSON:

~~~json
{
  "decision": "repair",
  "summary": "Short explanation",
  "changes": [
    {
      "path": "src/example.ts",
      "content": "complete replacement content"
    },
    {
      "path": "obsolete-file.ts",
      "delete": true
    }
  ]
}
~~~

The alternative is a structured abstention. Plans with malformed JSON, invalid paths, conflicting
content/delete fields, unsupported toolchains, excessive size, or failed verification must never
reach GitHub. The current format uses complete file replacement or deletion, not model-generated
shell commands.

---

## 5. What is already complete

Do not reopen these items unless a failing test or a new requirement proves a gap:

- Monorepo scripts, independent service Dockerfiles, Compose wiring, Kubernetes base resources.
- Authenticated control API routes, security headers, downstream bounds, readiness, and local
  token-bucket admission.
- Incident candidate validation, fingerprinting, retry, persistence, deduplication, occurrence
  history, cursor listing/filtering, and lifecycle policy.
- Temporal workflow from triage through draft PR, including cleanup and failure/abstention paths.
- RepairAgentHarness abstraction and configuration-selected DeepSeek implementation.
- Test-only fake harness with production rejection and no automatic fallback.
- Ten read-only diagnostic tools:
  getServiceTopology, getIncident, getTrace, queryLogs, queryMetrics, getDeploymentContext,
  getRecentChanges, readFileRange, searchCode, and findTests.
- MCP stdio transport, permission authorization, call budgets, cancellation, output bounds, and
  metadata-only audit records.
- Project-owned Node and Go sandbox executors with safe archive extraction and fixed verification.
- Kubernetes sandbox Job idempotency, gVisor runtime, non-root execution, seccomp, dropped
  capabilities, no service-account token, resource/deadline/TTL limits, RBAC, and NetworkPolicy.
- GitHub App JWT, installation token cache, HMAC webhook verification, source archives, Git Data
  delivery, deterministic branch naming, idempotent commits, and draft PR creation.
- OTel processing with redaction, resource attributes, batch, retry, and file-backed sending queues.
- Base deployment files and k6 profiles for the control plane and provider-bound runner.

The following are external acceptance checks, not reasons to rewrite existing services:

- Live Gemini diagnosis with a valid provider credential.
- Live GitHub App installation against a disposable test repository.
- A real sandbox Job in the target gVisor-enabled Kubernetes cluster.
- Sustained 1,667 requests/second, equivalent to approximately 100,000 requests/minute, in
  production-like infrastructure.

---

## 6. Remaining work in recommended order

The priorities below minimize rework. Complete the slices within a milestone in order unless a user
explicitly changes the priority.

## Milestone 1 — continuous integration and release evidence

### Objective

Make every claimed verification reproducible on a clean runner and make container artifacts
traceable to a source commit.

### Slice A — pull-request CI

Add GitHub Actions workflows that:

1. Install the repository-pinned pnpm version and Node version.
2. Run pnpm install --frozen-lockfile.
3. Run lint, TypeScript typecheck, unit tests, and builds.
4. Run gofmt checks, go vet, and go test for each Go module independently.
5. Validate Docker Compose configuration.
6. Validate Kubernetes YAML strictly with a pinned validator.
7. Validate the OTel collector configuration.
8. Scan for committed secrets without uploading source or secrets to an unapproved service.

Use path filters only after a full baseline workflow exists. A path-filtered job must still cover
shared configuration changes.

### Slice B — image build and supply-chain evidence

Build every Dockerfile with immutable tags containing the commit SHA. Generate an SBOM and
vulnerability report, record the digest, and optionally sign images when registry identity is
available. Do not deploy mutable latest tags.

Images include:

- control-api
- incident-detector
- incident-service
- incident-service migrator
- repair-worker
- agent-runner
- sandbox-controller
- sandbox-executor Node
- sandbox-executor Go
- github-app
- otel-collector

### Slice C — migration and release gates

Run incident database migrations as a pre-deployment Job. A failed migration stops rollout. Add a
release summary containing test results, manifest validation, image digests, and migration outcome.

### Acceptance criteria

- A clean pull request runs all language and manifest checks.
- A deliberate TypeScript error, Go error, invalid manifest, and secret fixture each fail the
  expected job.
- Images are addressable by digest.
- CI does not require real model, GitHub, or production Kubernetes credentials for unit tests.
- Environment-dependent tests are separate opt-in jobs and are never silently replaced by fakes.

---

## Milestone 2 — durable repair-run projection and audit history

### Why this is next

Temporal is the durable orchestration engine, but it should not be the primary query database for a
frontend, analytics, or long-term audit reporting. The control API currently exposes workflow
start/status, but the product still needs a query-optimized run history.

### Recommended ownership

Create Backend/services/repair-run-service as a small Go/PostgreSQL service, or create a separately
owned schema/module only if the team intentionally decides not to add another deployment. The
recommended choice is a separate service because repair-run audit retention and query load differ
from incident write traffic.

Do not copy incident records into this service. Store incident_id as a reference and retrieve
incident truth from incident-service when needed.

### Required contracts

Application contracts should be small:

- RepairRunRepository
  - Create
  - Get
  - List
  - AppendEvent
  - Complete
- RepairRunClock
- RepairRunIDGenerator only if the workflow ID is not already the identifier
- EventPublisher as an optional future boundary, not a required broker in V1
- RequestAuthenticator and RequestRateLimiter following existing service patterns

Infrastructure implementations:

- PostgresRepairRunRepositoryV1
- SystemRepairRunClockV1
- BearerTokenRequestAuthenticatorV1
- TokenBucketRequestRateLimiterV1

### Minimum schema

repair_runs:

- id: text or UUID, primary key; must match the Temporal workflow/run identity policy
- incident_id: UUID, indexed
- repository_owner and repository_name
- expected_commit
- toolchain
- status
- started_at, updated_at, completed_at
- version for optimistic concurrency
- diagnosis_summary, abstention_reason, failure_code
- sandbox_id
- pull_request_url and pull_request_number
- verification_summary

repair_run_events:

- id: monotonically sortable identifier
- repair_run_id, indexed with occurred_at
- event_type
- stage
- outcome
- occurred_at
- safe metadata JSON with size limits
- idempotency_key, unique per run

Do not store raw secrets, model prompts, full logs, complete source files, access tokens, or
unbounded model responses in either table.

### API

- POST /api/v1/repair-runs for an authenticated idempotent creation/upsert from the worker
- POST /api/v1/repair-runs/{id}/events for idempotent event append
- PATCH /api/v1/repair-runs/{id} for optimistic terminal/status updates
- GET /api/v1/repair-runs/{id}
- GET /api/v1/repair-runs with cursor pagination and filters for incident, status, repository, and
  time range
- GET /api/v1/repair-runs/{id}/events with cursor pagination
- GET /health, GET /ready, GET /metrics

### Workflow integration

Add a RepairRunProjectionGateway contract to repair-worker. Its HTTP implementation records stage
events from activities. Workflow code must remain deterministic: network I/O stays in activities.
Every projection write needs an idempotency key derived from repair run plus stage plus attempt-safe
semantic event name.

Projection failure policy:

- Creation before work begins is required and retryable.
- Intermediate audit writes are retryable but must not cause duplicate events.
- A temporary projection outage must not cause a verified repair to be delivered twice.
- Final state must be reconciled by a retryable activity or scheduled reconciliation job.

### Acceptance criteria

- Migrations are repeatable on an empty database.
- Repository integration tests use a real PostgreSQL instance.
- Duplicate create/event requests do not create duplicates.
- Concurrent stale updates are rejected.
- Keyset pagination has stable ordering.
- A real Temporal controlled-dependency test produces a complete ordered projection.
- Control API reads the projection through a gateway; it does not query the repair-run database
  directly.

---

## Milestone 3 — GitHub webhook reconciliation

### Objective

Convert the existing verified webhook boundary into durable, idempotent product behavior after a
draft PR is created.

### Current boundary

POST /api/v1/webhooks/github verifies the GitHub HMAC signature and accepts the event. It must be
extended with durable delivery deduplication and event-specific application handlers.

### Required design

Add contracts in the GitHub App application layer:

- WebhookDeliveryStore
- WebhookEventDispatcher
- PullRequestOutcomeSink
- InstallationStateStore if installation lifecycle must persist

Use X-GitHub-Delivery as the idempotency key. Persist the verified delivery before executing side
effects. Store bounded metadata and a payload hash; avoid indefinite storage of raw webhook bodies.

Initial handlers:

1. pull_request closed with merged=true:
   - resolve the linked repair run;
   - request incident transition awaiting_review -> resolved;
   - record merge commit and completion metadata.
2. pull_request closed with merged=false:
   - record the outcome;
   - use a documented policy for incident state, normally failed or open for retriage.
3. pull_request ready_for_review or converted_to_draft:
   - update repair-run review state without changing incident truth unnecessarily.
4. installation deleted/suspended:
   - invalidate cached installation credentials and mark delivery unavailable.

Link PRs to repair runs using deterministic branch naming plus a commit trailer or explicit
repository mapping. Never trust arbitrary webhook text as a repair-run identifier.

### Delivery mechanics

The webhook endpoint must acknowledge only after durable acceptance. Event processing may be
asynchronous through a small queue/outbox worker. If no broker is introduced, use a PostgreSQL
outbox with row leasing and bounded retry. Keep the queue behind an interface so a future NATS,
Kafka, or cloud queue adapter can replace it.

### Acceptance criteria

- Invalid signatures return an authorization error and perform no write.
- Replaying the same delivery ID is a no-op.
- A transient incident-service outage is retried without duplicate transitions.
- Merge and close policies are covered by unit tests.
- A live test repository merge updates the repair projection and incident exactly once.

---

## Milestone 4 — frontend incident and repair experience

### Objective

Turn the existing React/Vite shell into an operational interface without bypassing the control API.

### Pages

1. Incident queue
   - status, severity, service, first/last seen, occurrence count
   - cursor pagination and filters
   - clear loading, empty, stale, and error states
2. Incident detail
   - normalized evidence and occurrence timeline
   - lifecycle state and allowed actions
   - related repair runs
3. Repair-run detail
   - ordered stage timeline
   - harness/provider/model identity
   - diagnosis summary and abstention/failure reason
   - proposed file list
   - verification profile and result
   - draft PR link and review/merge state
4. Repair start dialog
   - repository installation, repository, exact commit, toolchain, and explicit confirmation
   - idempotency-aware response handling
5. System status
   - dependency readiness and degraded state, building on the current shell

### API rule

The browser calls only the control API. Add facade contracts and gateway methods there for incident
listing, occurrence history, repair-run listing/details/events, and allowed actions. Do not expose
internal service tokens to the browser.

### Frontend structure

Use typed API clients and small feature modules. Keep server state in a query/cache layer and local
form state in components. Do not duplicate incident transition rules in React; render allowed
actions returned by the backend or handle rejected transitions clearly.

### Acceptance criteria

- Unit/component tests cover loading, empty, success, stale, unauthorized, validation, and failure.
- End-to-end tests can use deterministic service doubles.
- Starting the same repair twice does not create duplicate workflows.
- No secret or internal URL is present in the browser bundle.
- Large evidence and event histories are paginated rather than loaded at once.

---

## Milestone 5 — production workspace snapshot provider

### Why it matters

The agent runner currently receives a read-only mounted workspace. This is appropriate for local
development and single-repository testing, but a production multi-repository system needs the exact
repository snapshot matching each incident and expected commit.

### Design

Add a DiagnosticWorkspaceProvider contract outside the individual tools:

- Acquire(read-only repository identity, expected commit, repair run ID)
- ResolvePath(workspace handle)
- Release(workspace handle)

Possible V1 implementation:

- request a bounded source archive from the GitHub App;
- verify the expected commit and archive size;
- extract safely using the same traversal/symlink principles as the sandbox;
- mark the directory read-only;
- return an opaque handle;
- release it after diagnosis, including cancellation paths.

Do not give the model the archive URL, credentials, or host path. Trusted server context provides the
workspace handle to the tool executor.

For scale, a later implementation may use a content-addressed read-only cache keyed by repository
and commit. Cache population needs per-key locking, integrity verification, quotas, eviction, and
tenant isolation.

### Acceptance criteria

- The diagnosed source commit exactly matches expected_commit.
- Path traversal, symlinks, oversized archives, and archive bombs are rejected.
- Concurrent diagnoses of the same commit do not corrupt the cache.
- Release runs on success, error, cancellation, and timeout.
- All existing workspace tools operate through the acquired root without API changes visible to the
  model.

---

## Milestone 6 — policy engine and human approval controls

### Objective

Make repair eligibility and delivery policy explicit, versioned, auditable, and configurable.

### Contracts

- RepairEligibilityPolicy
- RepairChangePolicy
- DeliveryApprovalPolicy
- RepositoryPolicySource
- RiskScorer

Example implementations:

- ConservativeRepairEligibilityPolicyV1
- PathAndSizeRepairChangePolicyV1
- DraftPullRequestApprovalPolicyV1
- RepositoryFilePolicySourceV1
- WeightedRepairRiskScorerV1

### Initial policy inputs

- allowed repositories and installations
- protected/forbidden paths
- maximum changed files and total bytes
- generated, vendored, migration, dependency-manifest, and infrastructure paths
- test coverage or test-file requirement
- CODEOWNERS-sensitive paths
- severity and service tier
- confidence/evidence completeness
- repeated prior repair failures

### Behavior

- A denied plan becomes a structured abstention with a stable reason code.
- High-risk changes may still create a sandbox result but must not create a PR without the required
  approval policy.
- Auto-merge remains disabled unless the user explicitly approves a future auto-merge milestone and
  its rollback design.
- Policy decisions are recorded in the repair-run projection without raw sensitive evidence.

### Acceptance criteria

- Policies are deterministic and exhaustively unit-tested at boundaries.
- Repository-specific configuration is schema-validated and cannot enable arbitrary commands.
- Default production policy is conservative and fails closed.
- A policy version is recorded for every run.

---

## Milestone 7 — sandbox result and artifact durability

### Current limitation

The controller retrieves the bounded result from executor pod logs before cleanup. Task content is
passed through a Kubernetes Secret. This is reasonable for the current bounded implementation but
is not the final storage design for larger plans or long-lived audit evidence.

### Target

Introduce contracts:

- SandboxTaskStore
- SandboxResultStore
- SourceArchiveStore only if archive proxying is moved away from GitHub App
- ArtifactRetentionPolicy

A production implementation can use object storage with short-lived, audience-restricted signed
URLs. The controller should place references in Jobs, not large source/patch content. Encrypt at
rest and expire objects automatically.

Keep strict limits:

- maximum archive bytes and expanded bytes
- maximum file count
- maximum individual change and total change bytes
- maximum result/log bytes
- deadline, CPU, memory, ephemeral storage, and process constraints

Add dependency access through an allowlisted package proxy or prebuilt cache. Do not allow general
internet egress from repair Jobs.

### Acceptance criteria

- Results survive pod deletion for the configured retention period.
- Signed access expires and is scoped to one task/result.
- Orphaned objects and Jobs are reconciled.
- A cleanup retry cannot delete another run's artifacts.
- Oversized tasks fail before a Job is created.

---

## Milestone 8 — harness adapters and objective benchmarking

### Objective

Compare model/harness combinations through the existing RepairAgentHarness contract without
changing diagnosis application logic.

### Adapter structure

Each real adapter belongs under:

    Backend/services/agent-runner/src/infrastructure/<provider-or-harness>/

Each adapter must implement RepairAgentHarness and preserve:

- streaming event normalization
- cancellation and hard deadlines
- tool-call protocol
- bounded output
- stable error mapping
- provider/model identity reporting
- token/usage metadata when available
- no write-capable tools

Potential implementations:

- OpenAIRepairAgentHarnessV1
- AnthropicRepairAgentHarnessV1
- CodexRepairAgentHarnessV1
- a later DeepSeekHarnessV2 only for changed semantics

Do not name an adapter after the underlying model if it actually wraps a different harness. Record
both harness identity and provider/model identity.

### Benchmark suite

Create versioned, reproducible fixtures containing:

- a repository snapshot or immutable commit
- incident evidence
- expected causal area
- allowed/forbidden files
- expected test command through a fixed profile
- scoring metadata

Measure:

- diagnosis accuracy
- correct tool selection
- tool calls, tokens, latency, and cost
- valid-plan rate
- policy-pass rate
- sandbox-apply rate
- verified-fix rate
- regression rate
- abstention quality

The fake harness is never a benchmark subject. It is only for deterministic tests and plumbing.

### Acceptance criteria

- Selecting an adapter is a validated configuration change.
- The capabilities endpoint reports the active real harness/provider/model.
- The same fixtures run against every adapter with identical tool and budget policy.
- Results include confidence intervals or enough repetitions to avoid one-run conclusions.
- No benchmark credential or repository token enters source control.

---

## Milestone 9 — observability, SLOs, and reconciliation

### Instrumentation

Add consistent trace propagation and domain metrics across:

- control API request to detector/incident service
- repair start to Temporal workflow
- each repair activity and retry
- agent diagnosis and tool calls
- sandbox queue/start/finish
- GitHub delivery and webhook reconciliation

Do not put source code, prompts, model output, tokens, authorization headers, webhook bodies, or
unbounded incident evidence in telemetry.

### Initial service-level indicators

- candidate acceptance latency and error rate
- incident persistence/deduplication latency
- repair queue delay
- diagnosis latency, timeout, abstention, and failure rate
- sandbox scheduling and verification duration
- draft PR delivery latency and failure rate
- workflow stuck-run count
- webhook processing delay and retry count
- dependency readiness and circuit state

Define measured objectives only after baseline data exists. Suggested starting objectives may be
documented as provisional, not advertised as achieved.

### Reconciliation jobs

Add bounded reconcilers for:

- Temporal run versus repair projection
- awaiting_review run versus GitHub PR state
- orphaned sandbox Job/Secret/artifact
- stale webhook outbox records
- incident status versus completed repair outcome

Every reconciler must be idempotent, cursor-based, rate-limited, observable, and safe to stop.

### Acceptance criteria

- One trace or correlated run ID connects the major stages.
- Dashboards show volume, latency, errors, saturation, and queue age.
- Alerts have actionable runbooks and avoid alerting on every individual repair failure.
- Reconciliation repairs deliberately injected partial failures.

---

## Milestone 10 — scale, resilience, and 100k/minute certification

### Important interpretation

100,000 requests/minute is approximately 1,667 requests/second. This target applies to the high
volume control/incident path, not to 1,667 simultaneous model diagnoses or Kubernetes repair Jobs.
Those expensive stages require separate concurrency, queue, quota, and cost targets.

### Test layers

1. Component:
   - detector CPU and allocation profile
   - incident-service query/index behavior
   - control API event-loop and connection limits
2. Service:
   - detector -> incident service -> PostgreSQL
   - API with authentication and realistic payloads
3. System:
   - ingress/load balancer
   - multiple replicas
   - production-like PostgreSQL and network latency
4. Soak:
   - sustained load, queue stability, connection leaks, database growth, telemetry backpressure
5. Failure:
   - pod termination, dependency timeout, database failover, Temporal restart, GitHub rate limit,
     provider 429/5xx, sandbox scheduling failure

### Distributed admission

The current token buckets are per replica. Keep them for local protection, but enforce global
tenant/provider quotas at an ingress gateway or a dedicated distributed quota adapter. Add a
contract so Redis, Envoy rate-limit service, or a cloud quota system can be selected without changing
use cases.

Do not add Kafka or another broker only because the word scale appears. Introduce a broker when
measurements prove that direct durable handoff or Temporal task queues do not meet latency,
durability, or fan-out requirements.

### Database work

Measure before changing schema. Likely production work includes:

- connection pool sizing per replica
- index validation with EXPLAIN ANALYZE
- occurrence retention/partitioning
- autovacuum and storage growth
- read replicas only for compatible stale reads
- backup restore testing and point-in-time recovery

### Certification criteria

- Sustained target arrival rate with documented payload distribution and duration.
- No unbounded queue growth.
- Agreed p50/p95/p99 latency and error thresholds pass.
- Database, CPU, memory, connections, and telemetry remain inside headroom targets.
- Horizontal scaling behavior is measured.
- Expensive diagnosis/repair queues reject or defer cleanly at configured capacity.
- Failure injection demonstrates recovery without duplicate incidents, repairs, or PRs.
- A report records environment, image digests, configuration, exact k6 command, results, and known
  bottlenecks.

---

## Milestone 11 — deployment acceptance

This milestone executes rather than rewrites the implemented production boundaries.

### Environment prerequisites

- Kubernetes cluster with the configured gVisor RuntimeClass.
- Container registry accessible by the cluster.
- PostgreSQL with TLS, backups, and migration credentials.
- Temporal namespace and worker connectivity.
- GitHub App ID, private key, webhook secret, installation, and disposable test repository.
- Real model provider key injected through a secret manager.
- DNS, ingress, certificates, network policies, and workload identity.
- Prometheus, Loki, Jaeger-compatible tracing, and persistent collector queues.

### Deployment order

1. Build, scan, sign if configured, and publish immutable images.
2. Create namespaces, service accounts, RBAC, NetworkPolicies, quotas, and secret references.
3. Deploy data/observability dependencies or bind managed endpoints.
4. Run database migrations.
5. Deploy incident service and detector.
6. Deploy control API.
7. Deploy GitHub App and configure the exact webhook URL.
8. Deploy sandbox controller and executor image references.
9. Deploy agent runner with a real harness; verify capabilities does not report fake.
10. Deploy repair worker.
11. Execute readiness checks and one controlled repair.
12. Run the scale and failure suites.

### Required live acceptance scenario

Use a disposable repository containing a known deterministic bug:

1. Submit one incident and confirm persistence/deduplication.
2. Start one repair and save the repair run ID.
3. Confirm the real model performs read-only tool calls.
4. Confirm the plan is parsed and passes policy.
5. Confirm the gVisor Job uses the exact source commit and fixed profile.
6. Confirm verification passes.
7. Confirm one deterministic branch and one draft PR are created.
8. Retry selected workflow activities and confirm no second PR appears.
9. Merge or close the PR and confirm webhook reconciliation.
10. Confirm sandbox cleanup and retained audit metadata.

Record evidence without secrets or full sensitive payloads.

---

## 7. Optional later capabilities

These are valid extensions but should follow the prioritized milestones:

- GitHub Check Runs with bounded annotations linked to the draft PR.
- NotificationGateway with Slack, Teams, PagerDuty, email, or webhook implementations.
- Additional deployment-context adapters for ECS, Cloud Run, Nomad, or VMs.
- Additional fixed sandbox profiles for Python, Java, Rust, or .NET.
- Tenant-aware quotas, billing/cost budgets, and repository ownership.
- Approval service for regulated repositories.
- Rollback workflow for a merged repair only after merge/health correlation is reliable.
- Auto-merge only after explicit product approval, strong policy, staged rollout, health gates,
  rollback, and audit controls exist.

Each optional integration needs a narrow contract, one production adapter, a deterministic fake for
tests, validated configuration, auth/timeouts/bounds, metrics, and a runbook.

---

## 8. Existing contracts to extend instead of bypassing

### Agent runner

Contracts:

- src/application/contracts/repair-agent-harness.ts
- src/application/contracts/repair-agent-harness-registry.ts
- src/application/contracts/repair-tool.ts
- src/application/contracts/repair-tool-server.ts
- src/application/contracts/repair-tool-authorization.ts
- src/application/contracts/repair-tool-budget.ts
- src/application/contracts/repair-tool-audit.ts
- src/application/contracts/workspace-sources.ts
- src/application/contracts/observability-query-sources.ts
- src/application/contracts/deployment-context-source.ts

Composition:

- src/app.ts
- src/composition/repair-tool-runtime.ts

Add harnesses and evidence adapters here. Do not call SDKs from
IncidentDiagnosisServiceV1.

### Repair worker

Contracts:

- src/application/contracts/repair-activities.ts
- src/application/contracts/repair-service-gateway.ts
- src/application/contracts/repair-plan-parser.ts
- src/application/contracts/incident-triage-policy.ts

Composition and orchestration:

- src/worker.ts
- src/activities.ts
- src/workflows.ts

Keep workflows deterministic. Put HTTP, database, time, randomness, and SDK calls in activities.

### Control API

Contracts:

- src/application/contracts/control-plane-gateway.ts
- src/application/contracts/repair-workflow-gateway.ts
- src/application/contracts/control-api-query-service.ts
- src/application/contracts/control-plane-readiness-probe.ts

Routes:

- src/presentation/register-control-plane-routes.ts
- src/presentation/register-repair-routes.ts
- src/presentation/register-system-routes.ts

The control API is a facade. It does not own incident or repair-run persistence.

### Go services

Each Go service follows:

    internal/domain
    internal/application/contracts.go
    internal/application/<use-case>_v1.go
    internal/<adapter>
    internal/api
    cmd/<service>/main.go

The cmd package is the composition root. Keep SDK/database/Kubernetes details out of domain and
application logic.

---

## 9. Current API inventory

### Control API

- GET /api/v1/health
- GET /api/v1/health/live
- GET /api/v1/health/ready
- GET /api/v1/system
- POST /api/v1/incidents/candidates
- GET /api/v1/incidents/:incidentId
- POST /api/v1/diagnoses
- POST /api/v1/repairs
- GET /api/v1/repairs/:repairRunId

### Incident detector

- GET /health
- GET /ready
- GET /metrics
- POST /api/v1/candidates

### Incident service

- GET /health
- GET /ready
- GET /metrics
- POST /api/v1/incidents
- GET /api/v1/incidents
- GET /api/v1/incidents/{incidentID}
- GET /api/v1/incidents/{incidentID}/occurrences
- PATCH /api/v1/incidents/{incidentID}/status

### Agent runner

- GET /api/v1/health
- GET /api/v1/health/live
- GET /api/v1/health/ready
- GET /api/v1/capabilities
- GET /api/v1/tools
- POST /api/v1/diagnoses

### Sandbox controller

- GET /health
- GET /ready
- GET /metrics
- POST /api/v1/sandboxes
- GET /api/v1/sandboxes/{repairRunID}
- GET /api/v1/sandboxes/{repairRunID}/result
- DELETE /api/v1/sandboxes/{repairRunID}

### GitHub App

- GET /health
- GET /ready
- GET /metrics
- POST /api/v1/deliveries
- GET /api/v1/source-archives
- POST /api/v1/webhooks/github

### Repair worker

- GET /health/live
- GET /health/ready

When changing an API, update its README, tests, deployment probes if relevant, the control API
gateway if public access is needed, and this inventory.

---

## 10. Error, idempotency, and retry rules

- Validate requests at the presentation boundary and business invariants in domain/application code.
- Use stable machine-readable error codes and safe human messages.
- Do not return raw provider, database, Kubernetes, GitHub, or model errors to public clients.
- Retrying the same incident candidate must not create a duplicate active incident.
- Retrying repair start must resolve to the same workflow identity.
- Retrying sandbox creation must resolve to the same immutable task or reject a hash mismatch.
- Retrying GitHub delivery must resolve to the same branch/commit/PR.
- Retrying webhook delivery must not repeat a transition.
- Retry transient timeout, 429, and selected 5xx failures with bounded exponential backoff and
  jitter.
- Do not retry validation, authentication, authorization, policy denial, invalid plan, or permanent
  not-found errors.
- Every remote call needs a deadline, response-size bound, authentication decision, and observable
  outcome.
- Circuit breaking belongs in an adapter/decorator, not in domain entities.

---

## 11. Configuration and secret rules

Local Compose shows the supported configuration shape. Production values must come from a secret
manager or Kubernetes Secret references, never checked-in env files.

Important groups:

- shared internal bearer token
- control API auth and per-replica admission
- database URL and pool configuration
- Temporal address, namespace, and task queue
- active harness/provider/model and provider credential
- agent concurrency, queue, timeout, tool-call, and result limits
- allowed Kubernetes namespaces and service-label policy
- sandbox namespace, runtime class, images, source auth, deadlines, and resources
- GitHub App ID, base64 private key, webhook secret, and installation context
- OTel endpoints, TLS, queue paths, and environment attributes

Configuration rules:

- Parse and validate once at startup.
- Production rejects blank/default secrets and unsafe combinations.
- Health means process alive; readiness means required dependencies/configuration are usable.
- Never log complete configuration objects.
- Tests may construct explicit settings directly.
- Local default tokens are not production credentials.

---

## 12. Testing requirements

### Unit tests

Test domain policies and application use cases without network or database access. Fakes must be
deterministic and must record calls needed for assertions.

### Contract/adapter tests

Test request mapping, response mapping, authentication headers, timeouts, cancellation, size bounds,
retry classification, and safe error mapping.

### Integration tests

Use real PostgreSQL for repositories, real Temporal for workflow semantics, and a fake Kubernetes
API only for controller object construction. A target-cluster test is still required for runtime
security and scheduling.

### End-to-end tests

Use a disposable repository and installation. Never run a mutation test against a user's important
repository. Assert idempotency by replaying calls, not only by checking the happy path once.

### Negative tests required for new external boundaries

- missing/invalid authentication
- timeout and cancellation
- response or payload too large
- malformed JSON
- unknown enum/status/event type
- duplicate idempotency key
- stale optimistic version
- transient 429/5xx
- permanent 4xx
- secret redaction
- production configuration with a fake or missing credential

---

## 13. Documentation update template

Append a journal entry to Documentation/FUNCTIONALITY_CATALOG.md:

~~~markdown
### YYYY-MM-DD — <short milestone name>

- Implemented: <concrete behavior and owning service>.
- Architecture: <new contract and production implementation>.
- Safety: <auth, bounds, idempotency, cancellation, policy, or secret behavior>.
- Verified: <exact commands/tests and result>.
- Still pending: <live credentials, cluster, load, or other external evidence>.
~~~

Also update:

- the service README for routes/configuration/operations;
- Backend/ARCHITECTURE.md only for repository-wide conventions;
- deployment manifests when ports, probes, environment, permissions, or dependencies change;
- Compose for a runnable local dependency;
- the API inventory and milestone status in this document when scope changes.

Do not write “complete” when only code generation succeeded. Record what was actually executed.

---

## 14. Things the implementation model must not do

- Do not rewrite completed services from scratch.
- Do not merge all services into a monolith.
- Do not move repository mutation into the agent runner.
- Do not expose write-capable MCP tools to the model.
- Do not accept arbitrary shell commands from a model response.
- Do not allow the model to choose an arbitrary executor image, URL, namespace, or secret.
- Do not use the fake harness for a live model test or benchmark.
- Do not silently fall back from a real harness to fake.
- Do not query service databases directly from the control API.
- Do not put network I/O inside Temporal workflow functions.
- Do not make GitHub writes before sandbox verification passes.
- Do not auto-merge draft PRs as part of an unrelated feature.
- Do not add a broker, cache, or database without a measured or stated ownership need.
- Do not create broad interfaces solely to satisfy the appearance of abstraction.
- Do not add speculative methods to contracts.
- Do not store prompts, code, raw logs, tokens, or webhook bodies without an explicit retention,
  size, privacy, and access policy.
- Do not run destructive Git commands or discard dirty-worktree changes.
- Do not commit, push, deploy, or rotate user credentials unless explicitly requested.

---

## 15. Validation commands

Run commands from the repository root unless noted.

### JavaScript and TypeScript

~~~powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
~~~

For a faster local loop, use the selected workspace first, then run the repository-wide commands:

~~~powershell
pnpm --filter @sre-agent/agent-runner test
pnpm --filter @sre-agent/control-api test
pnpm --filter @sre-agent/repair-worker test
~~~

Confirm the exact workspace package names in each package.json before copying a filter.

### Go

Each service is an independent Go module. From each changed Go service directory:

~~~powershell
Get-ChildItem -Recurse -Filter *.go | ForEach-Object { gofmt -w $_.FullName }
go vet ./...
go test ./...
~~~

At minimum cover:

- Backend/services/incident-detector
- Backend/services/incident-service
- Backend/services/sandbox-controller
- Backend/services/sandbox-executor
- Backend/services/github-app
- any new Go service

If host Go is unavailable, use the pinned official Go container and mount only the service module.

### Compose and manifests

~~~powershell
docker compose config --quiet
~~~

Validate both:

- Backend/deploy/core-services.yaml
- Backend/deploy/remaining-services.yaml

Use a pinned strict Kubernetes schema validator matching the target cluster version. Also validate
Backend/services/otel-collector/config.yaml with the same collector image used in deployment.

### Runtime checks

- Health and readiness for every changed service.
- Authentication failure and success.
- One valid request and one invalid request.
- Dependency unavailable behavior.
- Idempotent replay.
- Graceful cancellation/shutdown when applicable.

### Secret check

Before commit or push, inspect the diff for provider keys, private keys, bearer tokens, webhook
secrets, database credentials, kubeconfigs, signed URLs, and generated credential files. Redact any
secret accidentally present in logs or docs and rotate it outside the repository if it was exposed.

---

## 16. Definition of done for every slice

A slice is done only when all applicable statements are true:

- The domain/application responsibility has a clear owner.
- Replaceable external behavior is represented by a narrow contract.
- At least one real implementation is wired in the composition root.
- Test fakes are explicit and cannot be selected accidentally in production.
- Inputs, outputs, errors, cancellation, timeouts, and size limits are defined.
- Authentication and authorization are enforced at the correct boundary.
- Idempotency and retry behavior are documented and tested.
- Unit and adapter tests pass.
- Repository-wide lint, typecheck, test, and build pass when relevant.
- Go format, vet, and tests pass when relevant.
- Docker and deployment configuration is updated and validated when relevant.
- Service README and FUNCTIONALITY_CATALOG are updated.
- Environment-dependent work is listed as pending rather than presented as verified.
- No secret is committed.
- Existing dirty-worktree changes remain intact.

---

## 17. Recommended immediate next task

Start with Milestone 1, Slice A: reproducible pull-request CI. It creates a safety net for every later
Luna session and requires no production credentials. Then implement Milestone 2 in small slices:

1. repair-run domain, contracts, migrations, and repository tests;
2. repair-run HTTP API, auth, rate limiting, health, readiness, and metrics;
3. repair-worker projection gateway and idempotent stage events;
4. control API facade routes;
5. real Temporal controlled-dependency projection test;
6. documentation and deployment wiring.

After that, complete GitHub webhook reconciliation before investing heavily in the frontend. The
frontend depends on the durable repair-run timeline and final PR outcome state; building it earlier
would create temporary APIs and duplicated state.

The safest product sequence is therefore:

    CI -> repair projection -> webhook reconciliation -> frontend
       -> production workspace provider -> policy/artifacts
       -> harness benchmarks -> observability -> scale certification -> live acceptance

This sequence preserves the existing architecture, gives each future session a bounded deliverable,
and moves the repository from a complete backend repair path to an operable, auditable, and
measurably scalable product.
