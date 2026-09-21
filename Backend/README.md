# Backend services

The backend is split into independently deployable services. Each service owns its runtime, configuration, and Dockerfile.

All coded services follow the ports-and-adapters and SOLID conventions documented in [ARCHITECTURE.md](ARCHITECTURE.md).

| Service | Runtime | Local port | Responsibility |
| --- | --- | ---: | --- |
| `control-api` | Node.js/TypeScript | 4000 | Operator API and future GitHub App ingress |
| `incident-detector` | Go | 4010 | Candidate validation, normalization, and fingerprinting |
| `incident-service` | Go/PostgreSQL | 4020 | Durable incident state and occurrence deduplication |
| `repair-worker` | Node.js/TypeScript/Temporal | none | Durable repair workflow and agent activities |
| `sandbox-controller` | Go/Kubernetes | 4030 | Creates restricted, disposable repair Jobs |
| `otel-collector` | OpenTelemetry Collector | 4317/4318 | OTLP gateway, batching, memory limiting, and export |

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

## Production notes

- Replace local credentials and unencrypted internal endpoints with secret-manager and workload-identity integrations.
- Run PostgreSQL, Temporal, trace storage, and object storage as managed or highly available services.
- Place OTLP gateways behind a load balancer and scale detector consumers independently.
- Install a default-deny CNI policy and the `gvisor` RuntimeClass before enabling sandbox execution.
