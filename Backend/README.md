# Backend services

The backend is split into independently deployable services. Each service owns its runtime, configuration, and Dockerfile.

All coded services follow the ports-and-adapters and SOLID conventions documented in [ARCHITECTURE.md](ARCHITECTURE.md).

| Service | Runtime | Local port | Responsibility |
| --- | --- | ---: | --- |
| `control-api` | Node.js/TypeScript | 4000 | Operator API and future GitHub App ingress |
| `incident-detector` | Go | 4010 | Candidate validation, normalization, and fingerprinting |
| `incident-service` | Go/PostgreSQL | 4020 | Durable incident state and occurrence deduplication |
| `repair-worker` | Node.js/TypeScript/Temporal | none | Durable repair workflow and agent activities |
| `agent-runner` | Node.js/TypeScript/DeepSeek Harness | 4040 | Harness-neutral, read-only diagnostic agent execution |
| `sandbox-controller` | Go/Kubernetes | 4030 | Creates restricted, disposable repair Jobs |
| `otel-collector` | OpenTelemetry Collector | 4317/4318 | OTLP gateway, batching, memory limiting, and trace/log/metric routing |
| `loki` | Grafana Loki | 3100 | Local OTLP log storage and LogQL query API |
| `prometheus` | Prometheus | 9090 | Local metric storage, remote-write ingestion, and PromQL query API |

## Local stack

From the repository root:

```powershell
pnpm install
docker compose up --build
```

The sandbox controller is excluded from the default Compose stack because it requires a Kubernetes API and gVisor runtime. Apply its manifests before deploying it to a cluster:

```powershell
kubectl apply -f Backend/services/sandbox-controller/deploy/rbac.yaml
kubectl apply -f Backend/services/sandbox-controller/deploy/network-policy.yaml
```

The sandbox endpoint accepts only a repair-run identifier and an allowlisted toolchain. It deliberately does not accept arbitrary images or commands.

The agent runner currently exposes the first read-only diagnostic slice. Its application layer
depends on `RepairAgentHarness`; `DeepSeekRepairAgentHarnessV1` is selected through
`AGENT_HARNESS=deepseek`, while `AGENT_HARNESS=fake` provides keyless local and test execution. See
[agent-runner/README.md](services/agent-runner/README.md) for configuration. The Compose `agent`
profile is preconfigured for Gemini through a credential-reference-only Cordis patch; supply
`GEMINI_API_KEY` at runtime.

Its first project-owned tools read configured service topology, incidents, traces, recent Git
metadata, bounded source ranges, code-search matches, and related tests. They are catalogued behind
application contracts and exposed to the model only through a local MCP adapter, not an
unauthenticated HTTP execution endpoint.

## Production notes

- Replace local credentials and unencrypted internal endpoints with secret-manager and workload-identity integrations.
- Run PostgreSQL, Temporal, trace storage, and object storage as managed or highly available services.
- Place OTLP gateways behind a load balancer and scale detector consumers independently.
- Install a default-deny CNI policy and the `gvisor` RuntimeClass before enabling sandbox execution.
