# Agent runner

The agent runner is the harness-neutral execution boundary for diagnostic and repair agents. The
first implementation integrates DeepSeek Harness through its TypeScript SDK. Application and domain
code do not import DeepSeek packages.

## Extension points

- `RepairAgentHarness` is the stable application port. Add another harness beside
  `DeepSeekRepairAgentHarnessV1`, register it with `RepairAgentHarnessRegistryV1`, and select it
  through `AGENT_HARNESS`.
- `RepairTool` is the project-owned tool contract. The MCP adapter exposes catalogued tools to the
  active harness without changing their implementations; other harness adapters can reuse it.
- `RepairToolExecutor` is the single validation and dispatch path used by future harness adapters.
- `RepairToolAuthorizationPolicy` enforces permission allowlists before dispatch.
- `RepairToolCallBudget` bounds model-driven tool loops per repair run.
- `RepairToolAuditSink` records metadata-only outcomes without storing arguments or results.
- `RepairToolServer` is the transport-neutral server lifecycle contract; the first implementation
  is a local MCP stdio adapter.
- `DiagnosisPromptBuilder` owns the versioned diagnostic prompt.
- `DeepSeekRuntimeClient` isolates the alpha SDK surface from the DeepSeek harness adapter.

`AGENT_HARNESS=deepseek` selects the real adapter; `AGENT_HARNESS=fake` selects the deterministic
test adapter. DeepSeek runs are created per request, receive an isolated Harness home directory,
and are closed after completion.

### Fake harness: test-only adapter

`FakeRepairAgentHarnessV1` does not invoke DeepSeek Harness, Gemini, DeepSeek, OpenAI, Anthropic, or
any other model. It returns a deterministic response so API, orchestration, and CI tests can run
without credentials or model cost. It is not a repair engine and must not be used for model quality,
latency, token, tool-choice, or repair-success benchmarks.

The fake harness is selected only when `AGENT_HARNESS=fake` is explicitly configured; it is never an
automatic fallback when the real harness or provider fails. For real testing and benchmarking:

```powershell
$env:AGENT_HARNESS = "deepseek"
```

Before recording results, call `GET /api/v1/capabilities` and confirm that the response contains
`"harness": "deepseek"`. In deployment environments, set `AGENT_HARNESS=deepseek` explicitly rather
than relying on a default. Reserve `AGENT_HARNESS=fake` for automated tests, CI plumbing checks, and
local API development that intentionally does not exercise a model.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_HARNESS` | `deepseek` | Harness implementation; use `deepseek` for real runs and `fake` only for deterministic tests |
| `API_AUTH_ENABLED` | `false` | Bearer authentication; required in production |
| `API_AUTH_TOKEN` | empty | Inbound service token; minimum 32 characters when enabled |
| `INTERNAL_SERVICE_TOKEN` | empty | Token sent only to internal control/incident APIs; required in production |
| `MAX_CONCURRENT_DIAGNOSES` | `20` | Maximum active model runs per replica |
| `MAX_QUEUED_DIAGNOSES` | `1000` | Bounded per-replica wait queue; excess receives `429` |
| `DIAGNOSIS_TIMEOUT_MS` | `900000` | Hard deadline for an admitted diagnosis |
| `BODY_LIMIT_BYTES` | `2000000` | Maximum API request body |
| `AGENT_WORKSPACE_PATH` | process working directory | Checked-out repository visible to the agent |
| `AGENT_MCP_SERVER_ENTRYPOINT` | `dist/mcp-server.js` | Absolute MCP stdio server entrypoint passed to Harness |
| `INCIDENT_SERVICE_URL` | `http://localhost:4020` | Incident read API |
| `TRACE_QUERY_URL` | `http://localhost:16686` | Jaeger-compatible trace query API |
| `LOKI_QUERY_URL` | `http://localhost:3100` | Loki-compatible LogQL query API |
| `PROMETHEUS_QUERY_URL` | `http://localhost:9090` | Prometheus-compatible PromQL query API |
| `KUBERNETES_DEFAULT_NAMESPACE` | `default` | Namespace used when `getDeploymentContext` omits one |
| `KUBERNETES_ALLOWED_NAMESPACES` | `default` | Comma-separated deployment namespaces the agent may query |
| `KUBERNETES_SERVICE_LABEL` | `app.kubernetes.io/name` | Deployment label used to match a service name |
| `DEEPSEEK_HOME` | `.dsh/agent-runner` | Isolated Harness state directory |
| `DEEPSEEK_PROFILE` | `sdk` | DeepSeek Harness profile |
| `DEEPSEEK_PATCH_PATHS` | empty | Comma-separated absolute or process-relative Cordis patch files |
| `DEEPSEEK_PROVIDER` | `deepseek-official` | Model provider route |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | Model identifier |
| `DEEPSEEK_REASONING_EFFORT` | `high` | `off`, `low`, `high`, or `max` |
| `DEEPSEEK_MAX_TOKENS` | `16384` | Per-request output-token ceiling |
| `DEEPSEEK_REQUEST_TIMEOUT_MS` | `900000` | Model-run timeout |
| `READ_ONLY_TOOL_TIMEOUT_MS` | `10000` | HTTP and fixed-process tool timeout |
| `READ_ONLY_TOOL_MAX_RESPONSE_BYTES` | `2000000` | HTTP or process output ceiling |
| `READ_ONLY_TOOL_MAX_FILE_BYTES` | `1000000` | Largest file accepted by `readFileRange` |
| `MCP_TOOL_MAX_RESULT_BYTES` | `2000000` | Maximum serialized result returned over MCP |
| `MAX_TOOL_CALLS_PER_RUN` | `30` | Per-repair-run tool invocation ceiling |
| `GIT_EXECUTABLE` | `git` | Fixed Git executable used for bounded history reads |
| `RIPGREP_EXECUTABLE` | `rg` | Fixed executable used by search and test discovery |

The adapter always starts the diagnosis profile with `DSH_PERMISSION_MODE=read-only`. Provider
credentials are inherited by the child runtime. Do not send a real model request without a
configured credential. Configure a provider in a Cordis patch and pass its path through
`DEEPSEEK_PATCH_PATHS`; provider selection then remains a configuration change rather than an
application-layer change.

Production startup rejects the fake harness and unauthenticated API configuration. Liveness is
available at `GET /api/v1/health/live`; readiness at `GET /api/v1/health/ready` verifies the selected
harness credential and compiled MCP entrypoint and reports active/queued admission state. Caller
disconnects and diagnosis deadlines propagate cancellation to the harness adapter, which closes its
per-run client. Internal bearer credentials are attached only to control and incident API reads and
are never sent to Jaeger, Loki, or Prometheus.

### Gemini preset

The Compose `agent` profile uses the project-owned
[`config/gemini.cordis.patch.yml`](config/gemini.cordis.patch.yml) and
[`config/project-tools.cordis.patch.yml`](config/project-tools.cordis.patch.yml) presets. They route
the DeepSeek Harness multi-provider adapter to Google's `google` provider and `gemini-3.8-flash`,
then connect the ten read-only project tools through a local MCP stdio child. The Gemini patch
contains only the `GEMINI_API_KEY` credential reference, never the key value. The Harness process
receives an explicit environment allowlist containing required system settings, selected provider
credentials, and internal API credentials; unrelated parent-process variables are not inherited.
Model arguments cannot override the trusted repair-run or workspace context, and no project tool
exposes environment variables.

Set a newly rotated key in the parent process before starting Compose:

```powershell
$env:GEMINI_API_KEY = Read-Host "Gemini API key"
$env:AGENT_WORKSPACE_HOST_PATH = "C:\path\to\a\disposable\checkout"
docker compose --profile agent up --build agent-runner
```

For a local non-container run, use the same provider and model with the repository patch path:

```powershell
$env:GEMINI_API_KEY = Read-Host "Gemini API key"
$env:DEEPSEEK_PATCH_PATHS = "Backend/services/agent-runner/config/gemini.cordis.patch.yml,Backend/services/agent-runner/config/project-tools.cordis.patch.yml"
$env:AGENT_MCP_SERVER_ENTRYPOINT = (Resolve-Path "Backend/services/agent-runner/dist/mcp-server.js")
$env:DEEPSEEK_PROVIDER = "google"
$env:DEEPSEEK_MODEL = "gemini-3.8-flash"
pnpm --filter @sre-agent/agent-runner dev
```

Never place the key in this patch, a committed `.env` file, an API request, or a diagnostic log.
Use the deployment platform's secret manager in production.

## Local smoke test

The fake adapter exercises the API without a model key:

```powershell
$env:AGENT_HARNESS = "fake"
pnpm --filter @sre-agent/agent-runner dev
```

Then send a diagnosis request to `POST http://localhost:4040/api/v1/diagnoses`.

Exercise the compiled MCP stdio boundary without a model credential:

```powershell
pnpm --filter @sre-agent/agent-runner build
pnpm --filter @sre-agent/agent-runner smoke:mcp
```

For Compose, place a disposable repository checkout in `./tmp/agent-workspace` or set
`AGENT_WORKSPACE_HOST_PATH` to another dedicated checkout, then run
`docker compose --profile agent up agent-runner`. Do not mount a developer home or a directory that
contains credentials: read-only mode prevents writes but is not a read-access boundary.

## Project-owned read-only tools

| Tool | Implementation boundary |
| --- | --- |
| `getServiceTopology` | Control API system-view reader |
| `getIncident` | Incident-service HTTP reader |
| `getTrace` | Jaeger-compatible HTTP reader |
| `queryLogs` | Bounded Loki-compatible LogQL range-query adapter |
| `queryMetrics` | Bounded Prometheus-compatible PromQL range-query adapter |
| `getDeploymentContext` | Namespace-allowlisted Kubernetes Deployment reader |
| `getRecentChanges` | Fixed `git log` process with argument arrays, timeout, and output cap |
| `readFileRange` | Canonical, repository-contained file reader; maximum 500 lines |
| `searchCode` | Fixed `rg` process with argument arrays, timeout, and output cap |
| `findTests` | Fixed `rg --files` discovery plus deterministic relevance ranking |

`GET /api/v1/tools` publishes their names, versions, permissions, and JSON input schemas. Direct
HTTP execution is intentionally absent. `McpStdioRepairToolServerV1` exposes
`RepairToolExecutorV1` only to the local Harness child, with read-only authorization, bounded
results, a per-run call budget, cancellation propagation, and JSON-lines audit metadata written to
stderr.
