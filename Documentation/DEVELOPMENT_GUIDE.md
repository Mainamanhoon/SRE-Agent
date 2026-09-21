# Development guide

## Local prerequisites

- Node.js 22 or newer
- pnpm 10 or newer
- Docker Desktop
- Git

## Initial setup

```powershell
Set-Location C:\Users\Psyfen\Desktop\SRE-Agent
Copy-Item Backend/.env.example Backend/.env
pnpm install
pnpm observability:up
pnpm dev
```

Open the frontend at `http://localhost:5173`, the backend health endpoint at `http://localhost:4000/api/v1/health`, and Jaeger at `http://localhost:16686`.

## Workspace commands

```powershell
pnpm dev          # Run frontend and backend in watch mode
pnpm build        # Build every workspace package
pnpm test         # Run unit and component tests
pnpm typecheck    # Run strict TypeScript checks
pnpm lint         # Check code and configuration with Biome
pnpm format       # Apply Biome formatting and safe fixes
```

## Backend layout

```text
Backend/
├─ src/
│  ├─ app.ts          Fastify composition and routes
│  ├─ config.ts       Validated environment configuration
│  ├─ server.ts       Process lifecycle and server startup
│  └─ telemetry.ts    OpenTelemetry SDK lifecycle
└─ test/
   └─ app.test.ts     API behavior tests
```

Keep application composition separate from process startup so tests can use Fastify injection without opening a TCP port.

## Frontend layout

```text
Frontend/
├─ src/
│  ├─ App.tsx         Operations dashboard
│  ├─ App.test.tsx    Component smoke test
│  ├─ main.tsx        Browser entry point
│  └─ styles.css      Responsive visual system
└─ vite.config.ts     Vite proxy and test environment
```

The frontend calls relative `/api` URLs. Vite proxies them to the backend locally, allowing production deployments to place both applications behind one gateway without rebuilding API URLs into components.

## Configuration rules

- Parse environment variables once at the process boundary.
- Never read `process.env` throughout domain code.
- Keep `.env` files untracked and update `.env.example` when adding required variables.
- Use the deployed Git SHA as `SERVICE_VERSION` in built images.
- Enable OTLP export with `OTEL_ENABLED=true` only when a collector is reachable.

## Engineering conventions

- Use strict TypeScript and model uncertain data with schemas.
- Keep infrastructure adapters outside domain logic.
- Make external-state operations idempotent.
- Pass trace and incident identifiers through structured context.
- Return structured tool results instead of raw terminal output.
- Keep model-provider APIs behind a project-owned interface.
- Prefer small patches and explicit state transitions.

## Testing strategy

- Unit tests cover normalization, fingerprinting, ranking, policy, and state transitions.
- API tests use Fastify injection.
- Frontend tests focus on operator-visible states and actions.
- Integration tests run PostgreSQL and telemetry dependencies in containers.
- Incident fixtures launch real services, inject a fault, capture telemetry, and apply hidden verification tests.

## Pull requests

Every PR should state the triggering problem, resulting behavior, validation commands, telemetry implications, and security implications. Generated repair PRs must also include the deployed revision, evidence, reproduction result, unified diff, verification results, and risk classification.
