# Autonomous Self-Healing SRE Agent

An evidence-driven incident response platform that correlates OpenTelemetry data with deployed source code, reproduces failures in an isolated workspace, generates constrained fixes, verifies them, and prepares reviewable pull requests.

## Workspace

- `Backend` — independently deployable control, detection, incident, repair, sandbox, and telemetry services.
- `Frontend` — React/Vite operations dashboard.
- `Documentation` — architecture, roadmap, implementation, security, and evaluation plans.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- Docker Desktop for the observability stack

## Getting started

```powershell
Copy-Item Backend/services/control-api/.env.example Backend/services/control-api/.env
pnpm install
pnpm dev
```

The backend listens on `http://localhost:4000`. The frontend listens on `http://localhost:5173` and proxies `/api` requests to the backend.

## Useful commands

```powershell
pnpm dev
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm observability:up
pnpm observability:down
pnpm stack:up
pnpm stack:down
```

Start with [Backend/README.md](Backend/README.md) for the service inventory and [Documentation/README.md](Documentation/README.md) for the implementation order.
