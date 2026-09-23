# SRE Agent Functionality Catalog

This is the living inventory of implemented and planned backend functionality. Update the service
tables when behavior changes and append a dated entry to the implementation journal. A feature is
`verified` only when its automated or end-to-end test is recorded here.

## Status vocabulary

- **Verified** — implemented and exercised by an automated test or a documented live smoke test.
- **Implemented** — code and configuration exist, but an environment-dependent verification remains.
- **Planned** — accepted scope with no production implementation yet.

## Current project checkpoint

The project has completed its foundation and read-only diagnosis phase. It can accept and persist
incident evidence, run durable orchestration scaffolding, invoke a harness-neutral diagnostic agent,
and expose ten bounded project-owned tools through MCP. It cannot yet modify a disposable
workspace, verify a generated repair, or publish a pull request, so the complete autonomous repair
loop is not yet operational.

| Workstream | Current state | What is available now | Main remaining work |
| --- | --- | --- | --- |
| Repository and service foundation | Verified | Monorepo, shared commands, independently deployable services, Dockerfiles, Compose, and clean architecture boundaries | CI/CD and production deployment manifests |
| Incident detection and storage | Verified | Candidate validation, normalization, fingerprinting, PostgreSQL persistence, deduplication, and incident reads | Connect production event ingestion and run database integration/load tests |
| Durable orchestration | Foundation verified | Temporal worker, workflow/activity contracts, retry-oriented boundaries, and triage policy | Implement the complete diagnose-repair-verify-review workflow and persist run state |
| Agent harness | Verified | `RepairAgentHarness` abstraction, DeepSeek Harness v1 implementation, test-only fake implementation, and configuration-based selection | Add benchmark adapters for other harnesses and run live provider evaluation |
| Diagnostic evidence tools | Verified | Ten read-only tools for topology, incidents, traces, logs, metrics, deployment rollout state, Git history, source reads, code search, and test discovery | Add provider adapters when a non-Kubernetes deployment target is selected |
| Tool safety and transport | Verified | MCP stdio transport, read-only authorization, per-run call budgets, result caps, cancellation, trusted context, and metadata-only audit events | Durable/distributed budgets and production audit storage |
| Observability platform | Implemented | OTel receiver and routing configuration plus Jaeger, Loki, and Prometheus local backends | Start and smoke-test the complete Docker stack and add dashboards/alerts |
| Disposable repair sandbox | Partial | Kubernetes controller abstraction, restricted Job policy, RBAC, network policy, and allowlisted toolchain images | Add workspace lifecycle and controlled patch/build/test/lint tools; verify against a real cluster |
| GitHub and delivery | Planned | Delivery boundary and permission model documented | GitHub App installation flow, repository reads, repair branches, commits, checks, and pull requests |
| Frontend | Foundation verified | React/Vite shell and backend health/status view | Incident queue, repair-run timeline, evidence, diff, verification, and approval screens |
| Scale and reliability | Planned | Stateless boundaries, Temporal, bounded tools, batching, and memory limits provide the intended scaling shape | Load tests for 100k requests/minute, queue admission, autoscaling, provider limits, circuit breakers, and SLOs |
| End-to-end autonomous repair | Not yet available | Individual detection, diagnosis, orchestration, sandbox, and observability foundations exist | Connect and verify `Detect -> Diagnose -> Sandbox -> Repair -> Verify -> Review -> Pull request` |

### Latest verification baseline

- JavaScript/TypeScript workspace: 29 automated tests passing across the agent runner, control API,
  repair worker, and frontend.
- Agent runner: 25 tests passing, plus TypeScript build/typecheck and repository-wide lint.
- MCP subprocess smoke: all ten tools discovered; bounded repository read and audit emission passed.
- Docker Compose: configuration validation passed for the application, Jaeger, Loki, Prometheus,
  OTel Collector, PostgreSQL, Temporal, and optional agent profile.
- Go services: fresh `go test ./...` runs passed for the incident detector, incident service, and
  sandbox controller using the checksum-verified official Go 1.27.1 temporary toolchain.
- Environment-dependent checks still pending: live Gemini diagnosis, running observability stack,
  Kubernetes sandbox Job, sustained load test, and full repair-to-pull-request execution.

## Service capabilities

| Service | Functionality | Status | Verification |
| --- | --- | --- | --- |
| Control API | Health and aggregate backend status boundary | Verified | Workspace test suite |
| Incident detector | Validate, normalize, fingerprint, and emit incident candidates | Verified | Fresh `go test ./...` with Go 1.27.1 |
| Incident service | Record/deduplicate incidents and read an incident by ID | Verified | Fresh `go test ./...` with Go 1.27.1 |
| Repair worker | Temporal worker and triage/activity abstraction | Verified | TypeScript workspace tests |
| Agent runner | Harness-neutral diagnosis API with DeepSeek and deterministic test adapters | Verified | Agent-runner API and adapter tests |
| Agent runner | Gemini provider preset through DeepSeek Harness | Implemented | Cordis and Compose configuration validated; live credential smoke test pending |
| Agent runner | Project-owned read-only tool catalog | Verified | Tool, filesystem, ripgrep, control/incident/trace/observability HTTP-adapter, and API tests |
| Agent runner | MCP stdio bridge from Harness to project tools | Verified | In-memory protocol test plus compiled stdio subprocess discovery/read smoke test |
| Agent runner | Read-only permission allowlist and metadata-only tool audit | Verified | Executor success, unknown-tool, and denied-permission tests |
| Sandbox controller | Restricted Kubernetes Job creation abstraction | Verified | Fresh `go test ./...` with Go 1.27.1; cluster smoke test pending |
| OTel collector | OTLP receive, memory limit, batch, and Jaeger/Loki/Prometheus routing | Implemented | Compose configuration validated; live collector stack requires Docker |
| Loki | Local OTLP log ingestion and LogQL query backend | Implemented | Compose configuration validated; live stack requires Docker |
| Prometheus | Local remote-write metric ingestion and PromQL query backend | Implemented | Compose configuration validated; live stack requires Docker |

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

### Planned sandbox repair tools

| Tool | Intended permission | Owning boundary | Status |
| --- | --- | --- | --- |
| `createRepairWorkspace` | `workspace-write` | Sandbox controller | Planned |
| `applyPatch` | `workspace-write` | Disposable workspace adapter | Planned |
| `runTests` | `workspace-write` | Allowlisted sandbox process adapter | Planned |
| `runBuild` | `workspace-write` | Allowlisted sandbox process adapter | Planned |
| `runLint` | `workspace-write` | Allowlisted sandbox process adapter | Planned |
| `getDiff` | `read` | Disposable workspace adapter | Planned |
| `resetWorkspace` | `workspace-write` | Disposable workspace adapter | Planned |

### Planned GitHub and delivery tools

| Tool | Intended permission | Status |
| --- | --- | --- |
| `getRepository`, `getCommit`, `getPullRequest`, `getCheckRuns` | `read` | Planned |
| `createRepairBranch`, `pushRepairCommit`, `createPullRequest` | `external-write` | Planned |

External writes will require a workflow-issued capability and will never be registered in the
read-only diagnosis profile.

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
