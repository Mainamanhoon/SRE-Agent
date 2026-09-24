# SRE Agent Functionality Catalog

This is the living inventory of implemented and planned backend functionality. Update the service
tables when behavior changes and append a dated entry to the implementation journal. A feature is
`verified` only when its automated or end-to-end test is recorded here.

## Status vocabulary

- **Verified** — implemented and exercised by an automated test or a documented live smoke test.
- **Implemented** — code and configuration exist, but an environment-dependent verification remains.
- **Planned** — accepted scope with no production implementation yet.

## Current project checkpoint

The backend autonomous-repair path is implemented. It can accept and persist incident evidence,
start an idempotently named Temporal workflow, invoke a harness-neutral read-only diagnostic agent,
validate a structured repair plan, apply it inside a constrained disposable workspace, run a fixed
verification profile, and publish an idempotent draft pull request through a GitHub App. Live model,
GitHub, and Kubernetes-cluster acceptance still depends on deployment credentials and infrastructure.

| Workstream | Current state | What is available now | Main remaining work |
| --- | --- | --- | --- |
| Repository and service foundation | Verified | Monorepo, shared commands, independently deployable services, Dockerfiles, Compose, clean architecture boundaries, and Kubernetes core-service manifests | CI/CD and environment-specific ingress/network/secret overlays |
| Incident detection and storage | Verified | Candidate validation, normalization, fingerprinting, authenticated durable handoff, bounded retry, PostgreSQL persistence, deduplication, and incident reads | Run target-environment database integration and capacity tests |
| Durable orchestration | Verified | Complete Temporal diagnose/plan/sandbox/verify/deliver state machine, incident transitions, retry policy, idempotent run IDs, health endpoints, and cleanup | Add a durable repair-run projection optimized for UI queries |
| Agent harness | Verified | `RepairAgentHarness` abstraction, DeepSeek Harness v1 implementation, test-only fake implementation, and configuration-based selection | Add benchmark adapters for other harnesses and run live provider evaluation |
| Diagnostic evidence tools | Verified | Ten read-only tools for topology, incidents, traces, logs, metrics, deployment rollout state, Git history, source reads, code search, and test discovery | Add provider adapters when a non-Kubernetes deployment target is selected |
| Tool safety and transport | Verified | MCP stdio transport, read-only authorization, per-run call budgets, result caps, cancellation, trusted context, and metadata-only audit events | Durable/distributed budgets and production audit storage |
| Observability platform | Verified | OTel receiver, redaction/resource processors, durable queues/retries, Jaeger/Loki/Prometheus routing, and local backends | Add product dashboards/alerts and internal TLS overlay |
| Disposable repair sandbox | Implemented | Idempotent Kubernetes Job/Secret lifecycle, project-owned executor images, safe archive extraction, explicit file mutation, fixed Node/Go verification, result retrieval, RBAC, and network policy | Run the Job acceptance test in the target gVisor-enabled cluster |
| GitHub and delivery | Verified | GitHub App JWT/installation tokens, signed webhooks, bounded source archives, Git Data blobs/trees/commits, deterministic branches, and idempotent draft PRs | Run live acceptance against a test GitHub App installation |
| Frontend | Foundation verified | React/Vite shell and backend health/status view | Incident queue, repair-run timeline, evidence, diff, verification, and approval screens |
| Scale and reliability | Implemented | Fail-closed production config, bounded requests/responses, ingress rate limits, diagnosis concurrency/queue/deadlines, retries, readiness, disruption budgets, HPAs, and a 1,667 requests/second k6 profile | Execute and tune the 100k requests/minute test in production-like infrastructure; define measured SLOs and add distributed/global quotas where required |
| End-to-end autonomous repair | Implemented | `Detect -> Diagnose -> Plan -> Sandbox -> Verify -> Draft PR -> Awaiting review`, with a real Temporal orchestration smoke against controlled service doubles | Run live provider/GitHub/Kubernetes acceptance and add merge/rollback follow-up workflows |

### Latest verification baseline

- JavaScript/TypeScript changed services: 44 automated tests passing across the agent runner,
  control API, and repair worker; repository-wide final verification is recorded in the latest journal entry.
- Agent runner: 32 tests passing, plus TypeScript build/typecheck and repository-wide lint.
- MCP subprocess smoke: all ten tools discovered; bounded repository read and audit emission passed.
- Docker Compose configuration validation passed. Fresh production images were built for the
  control API, repair worker, incident service/migrator, GitHub App, sandbox controller, both
  executor toolchains, and the OTel collector.
- Go services: current detector `go vet ./...` and uncached `go test ./...` passed with the official
  Go 1.27.1 container; the incident-service and sandbox-controller suites retain their previously
  verified Go 1.27.1 baseline.
- Environment-dependent checks still pending: live Gemini diagnosis, a real GitHub installation,
  target-cluster Kubernetes sandbox Job, and the sustained 100k/minute load test.

## Service capabilities

| Service | Functionality | Status | Verification |
| --- | --- | --- | --- |
| Control API | Authenticated facade for candidate submission, incident reads, diagnoses, Temporal repair start/status, topology, readiness, and rate admission | Verified | Control API typecheck and automated route/config tests |
| Incident detector | Authenticate, rate-limit, validate, normalize, fingerprint, retry, and durably record incident candidates | Verified | Fresh `go test ./...` with Go 1.27.1, including delivery retry/failure tests |
| Incident service | Record/deduplicate incidents, retain occurrence history, keyset-list/filter, and enforce optimistic lifecycle transitions | Verified | Fresh Go suite plus live PostgreSQL repository and authenticated HTTP smokes |
| Repair worker | Full Temporal diagnose/repair/verify/draft-PR workflow with cleanup and health service | Verified | TypeScript tests plus real Temporal early-exit and complete-path controlled-dependency smokes |
| Agent runner | Authenticated harness-neutral diagnosis API with bounded concurrency, bounded queue, hard deadline, disconnect cancellation, readiness, DeepSeek, and deterministic test adapters | Verified | Agent-runner typecheck and API/admission/adapter tests |
| Agent runner | Gemini provider preset through DeepSeek Harness | Implemented | Cordis and Compose configuration validated; live credential smoke test pending |
| Agent runner | Project-owned read-only tool catalog | Verified | Tool, filesystem, ripgrep, control/incident/trace/observability HTTP-adapter, and API tests |
| Agent runner | MCP stdio bridge from Harness to project tools | Verified | In-memory protocol test plus compiled stdio subprocess discovery/read smoke test |
| Agent runner | Read-only permission allowlist and metadata-only tool audit | Verified | Executor success, unknown-tool, and denied-permission tests |
| Sandbox controller/executor | Authenticated idempotent Job lifecycle, immutable tasks, constrained mutation, fixed verification, and result retrieval | Verified | Go tests, fake-Kubernetes security/idempotency tests, and both production image builds; cluster smoke pending |
| GitHub App | App authentication, source archives, webhook verification, Git Data delivery, and idempotent draft PRs | Verified | Go tests, production image build, startup/health smoke, and fail-closed auth smoke |
| OTel collector | OTLP receive, redaction/resource processing, durable queues/retry, and Jaeger/Loki/Prometheus routing | Verified | Native collector config validation plus production image health smoke |
| Loki | Local OTLP log ingestion and LogQL query backend | Implemented | Compose configuration validated; live stack requires Docker |
| Prometheus | Local remote-write metric ingestion and PromQL query backend | Implemented | Compose configuration validated; live stack requires Docker |
| Core deployment | Multi-replica Kubernetes workloads, probes, resource bounds, PDBs, HPAs, persistent telemetry queues, migration Job, and secret references | Implemented | Strict schema validation of all 37 resources; target-cluster apply pending |
| Load tests | Constant-arrival control-plane test at 1,667 requests/second and separate provider-bound agent test | Implemented | k6 execution in a production-like environment pending |

## Harness execution modes

| Configuration | Intended use | Calls a real model | Valid for model benchmarks |
| --- | --- | --- | --- |
| `AGENT_HARNESS=deepseek` | Real diagnosis, integration testing, and harness/provider benchmarks | Yes | Yes |
| `AGENT_HARNESS=fake` | Deterministic unit tests, CI plumbing, and credential-free API development | No | No |

The fake harness is test-only and is never used as an automatic fallback. A real benchmark must set
`AGENT_HARNESS=deepseek` explicitly and verify `GET /api/v1/capabilities` reports
`"harness": "deepseek"` before results are recorded. A response produced with the fake harness must
never be counted as a model diagnosis or repair result.

## Agent tool catalog

### Diagnostic read tools

| Tool | Version | Permission | Purpose | Status |
| --- | --- | --- | --- | --- |
| `getServiceTopology` | `v1` | `read` | Load configured control-plane services and capabilities | Verified |
| `getIncident` | `v1` | `read` | Load one sanitized incident record by UUID | Verified |
| `getTrace` | `v1` | `read` | Load one Jaeger-compatible trace | Verified |
| `queryLogs` | `v1` | `read` | Run a bounded LogQL range query through a Loki-compatible adapter | Verified |
| `queryMetrics` | `v1` | `read` | Run a bounded PromQL range query through a Prometheus-compatible adapter | Verified |
| `getDeploymentContext` | `v1` | `read` | Read namespace-allowlisted Kubernetes rollout, replica, image, and condition evidence | Verified |
| `getRecentChanges` | `v1` | `read` | Read bounded Git commit metadata without a shell | Verified |
| `readFileRange` | `v1` | `read` | Read a bounded, repository-contained source range | Verified |
| `searchCode` | `v1` | `read` | Run bounded fixed-string or regex code search through ripgrep | Verified |
| `findTests` | `v1` | `read` | Discover and rank tests related to a source path or symbol | Verified |

All tool calls pass through `RepairToolExecutor`. The executor validates arguments, authorizes the
declared permission, consumes the per-run call budget, propagates cancellation, and emits an audit
outcome without recording tool arguments or result bodies. Repair-run identity and workspace
location are trusted server context; they are not part of model-controlled tool input.

### Controlled sandbox repair operations

| Tool | Intended permission | Owning boundary | Status |
| --- | --- | --- | --- |
| Create/fetch/delete repair workspace | `workspace-write` | Sandbox controller | Verified |
| Apply explicit replacement/deletion set | `workspace-write` | Sandbox executor | Verified |
| Install locked dependencies and run tests/typecheck/build | `workspace-write` | Fixed Node/Go profiles | Verified |
| Retrieve bounded structured result | `read` | Sandbox controller pod-log adapter | Implemented; cluster acceptance pending |

### GitHub and delivery operations

| Tool | Intended permission | Status |
| --- | --- | --- |
| Installation token and source archive | `read` | Verified |
| Create blobs/tree/commit and deterministic branch | `external-write` | Verified |
| Create or resolve an idempotent draft pull request | `external-write` | Verified |

External writes are reachable only through the authenticated workflow activity boundary and are
never registered in the read-only diagnosis MCP profile.

## Repair workflow target

```text
Detect -> Diagnose -> Create sandbox -> Repair -> Verify -> Review -> Publish PR
```

Temporal owns durable orchestration. Activities must be idempotent, bounded, independently
retryable, and persist a result reference rather than large raw evidence.

## Scaling and evaluation target

- Queue-backed admission and per-provider concurrency limits.
- Token, wall-clock, and tool-call budgets per repair run.
- Provider retry policy, circuit breaking, and rate-limit backpressure.
- Known-bug fixtures measuring diagnosis accuracy, tool choice, valid-patch rate, and verified-fix
  rate.
- Provider/harness benchmarks through the `RepairAgentHarness` contract.
- Horizontal scaling of stateless APIs; model repair runs scale through workers and queues rather
  than synchronous request fan-out.

## Implementation journal

### 2026-09-24 — Remaining backend production path

- Expanded incident storage with immutable occurrence history, keyset pagination/filtering,
  optimistic status transitions, authentication, admission control, metrics, database pool bounds,
  a repeatable migration image, and the `awaiting_review` lifecycle state.
- Completed Temporal repair orchestration from triage through diagnosis, strict JSON repair-plan
  validation, sandbox verification, idempotent draft-PR delivery, incident transitions, and
  non-cancellable cleanup. Added authenticated control API start/status endpoints and worker health.
- Replaced the sandbox placeholder command with project-owned Node and Go executor images. Tasks
  are bounded and immutable; archive extraction rejects traversal/symlinks; file changes are
  explicit; commands come only from fixed profiles; and Kubernetes Jobs are idempotent, non-root,
  capability-free, seccomp-constrained, deadline/resource-limited, and isolated by NetworkPolicy.
- Added a Go GitHub App service with replaceable gateway/token contracts, RSA App JWT and cached
  installation tokens, HMAC webhook verification, bounded source archives, Git Data blob/tree/commit
  delivery, deterministic branches, and retry-safe draft pull requests.
- Hardened the OTel gateway with shared resource attributes, sensitive-attribute redaction,
  file-backed queues, bounded retry, and persistent StatefulSet storage.
- Added Compose wiring, all remaining deployment resources, migration/executor build targets,
  service runbooks, secret references, probes, PDBs, HPAs, and restricted sandbox egress guidance.
- Verified 44 changed-service TypeScript tests, all new Go suites, a live PostgreSQL repository and
  authenticated incident HTTP lifecycle, a real Temporal abstention and full repair-to-draft-PR
  workflow against controlled dependencies, GitHub App fail-closed startup, native OTel validation
  and health, nine fresh production images, Compose parsing, and strict validation of 37 Kubernetes
  resources. Live Gemini, GitHub-installation, gVisor-cluster, and 100k/minute acceptance remain
  deployment-environment checks rather than code gaps.

### 2026-09-24 — Core-service production boundaries

- Added authenticated control-plane proxy routes for candidate submission, incident reads, and
  diagnoses, with bounded downstream timeouts/responses, dependency readiness, security headers,
  internal-service authentication, and replaceable per-replica admission control.
- Added agent-runner production validation, authentication, liveness/readiness, bounded concurrent
  diagnoses, a bounded queue, hard execution deadlines, client-disconnect cancellation, and
  provider/MCP readiness checks. Production configuration rejects the fake harness, and the Harness
  child receives an explicit environment allowlist rather than all parent-process variables.
- Connected the incident detector to the durable incident-service boundary. It now acknowledges a
  candidate only after persistence, retries transient failures, reports exhausted delivery as
  `503`, authenticates ingress, bounds request bodies/time, rate-limits per replica, and publishes
  candidate outcome metrics.
- Preserved SOLID extension points for gateways, sinks, readiness, authentication, admission,
  metrics, fingerprints, clocks, harnesses, and evidence sources, with versioned implementations
  outside the domain contracts.
- Added Compose wiring for internal credentials and service URLs, Prometheus scraping, production
  Kubernetes Deployments/Services/PDBs/HPAs, external Secret references, and a read-only agent
  workspace mount.
- Added a repeatable k6 acceptance profile for 1,667 requests/second (just over 100,000 requests per
  minute) and a separate diagnosis benchmark. Capacity remains an environment-measured claim and
  is not marked verified until the profile passes against production-like infrastructure.
- Kept sandbox mutation, durable repair workflow completion, GitHub App delivery, and frontend
  workflow screens outside these three service boundaries; they remain separate milestones.
- Verified repository-wide lint, all four TypeScript package typechecks/builds, all 42 workspace
  tests, Go vet and fresh detector tests, Compose parsing, offline parsing of all 12 Kubernetes YAML
  documents, three production image builds, three container liveness smokes, and fail-closed
  control API authentication.

### 2026-09-23 — Read-only agent foundation

- Added the harness-neutral `RepairAgentHarness` contract with DeepSeek and fake implementations.
- Added the five project-owned read-only diagnostic tools and their ports/adapters.
- Added bounded filesystem, ripgrep, incident HTTP, and Jaeger HTTP access.
- Added the Gemini provider preset without storing a credential value.

### 2026-09-23 — Local MCP and policy slice

- Added the official MCP v2 server/client packages for the 2026-07-28 protocol.
- Added `RepairToolServer`, `RepairToolAuthorizationPolicy`, `RepairToolAuditSink`, and
  `RepairToolClock` contracts with versioned implementations.
- Added `RepairToolCallBudget` with a configurable per-run ceiling and audited refusal behavior.
- Added the MCP stdio adapter, trusted run/workspace context injection, result-size limits,
  cancellation propagation, and metadata-only JSON-lines audit output.
- Added the DeepSeek Harness MCP Cordis preset and configured Compose to load it with Gemini.
- Added `getServiceTopology` through the existing control API system-view contract.
- Added `getRecentChanges` through fixed-argument, bounded `git log` execution.
- Verified 18 agent-runner tests, including MCP discovery/call framing, permission and budget
  denial, topology, and Git-history behavior.
- Verified the compiled MCP stdio child discovers all seven tools, reads a bounded source range, and
  writes an audit event.
- Live Gemini smoke testing remains pending until the credential is supplied through the runtime
  environment and the Node 24 container runtime is available. The installed local Node 22.12 cannot
  execute the Harness CLI entrypoint, which requires Node 22.19 or newer.

### 2026-09-23 — Observability query tools

- Added `LogQuerySource` and `MetricQuerySource` application contracts so query vendors remain
  replaceable without changing agent tools or Harness integration.
- Added `queryLogs` v1 with a Loki-compatible implementation, a 24-hour maximum window, a maximum
  of 500 returned entries, and normalized stream output.
- Added `queryMetrics` v1 with a Prometheus-compatible implementation, a 24-hour maximum window,
  bounded step size, a 10,000-sample-per-series ceiling, and normalized matrix output.
- Added explicit query-backend configuration propagation from the agent runtime to the isolated MCP
  child.
- Added pinned local Loki and Prometheus services and routed OTel log and metric pipelines into
  their native ingestion endpoints.
- Verified 22 agent-runner tests, including input bounds, URL construction, response normalization,
  and publication of all nine tools through the agent-runner API.
- Verified the compiled MCP stdio child discovers all nine tools, executes a repository read, and
  emits audit metadata.

### 2026-09-23 — Project-wide checkpoint

- Consolidated the current state of every workstream into the project checkpoint above.
- Confirmed that the read-only diagnostic path is implemented and verified, while autonomous code
  mutation and GitHub delivery remain planned.
- Recorded the latest 26-test JavaScript/TypeScript baseline and the remaining environment-dependent
  integration checks.
- Identified deployment context, sandbox repair tools, durable end-to-end orchestration, GitHub App
  delivery, load testing, and production hardening as the next implementation sequence.
- Documented the fake harness as a test-only adapter that is never a fallback and must be disabled
  for real integration tests and benchmarks by explicitly selecting and verifying `deepseek`.

### 2026-09-23 — Kubernetes deployment context

- Added the provider-neutral `DeploymentContextSource` and `DeploymentNamespacePolicy` contracts.
- Added `getDeploymentContext` v1 with a Kubernetes implementation using the official client,
  equality-based service-label filtering, a ten-deployment result cap, and normalized rollout,
  replica, image, annotation, and condition evidence.
- Added a configurable namespace allowlist and read-only Kubernetes RBAC for Deployment `get` and
  `list` operations.
- Expanded the verified catalog to ten read-only MCP tools and the agent-runner suite to 25 tests.
- Completed fresh verification for all three Go services with the official checksum-verified Go
  1.27.1 temporary toolchain and removed the temporary toolchain afterward.
- Attempted the remaining environment checks: Docker Desktop was started but its daemon did not
  become available; Node remains 22.12; and the Gemini credential is not present in the command
  process environment. These checks remain environment-blocked rather than code-blocked.
