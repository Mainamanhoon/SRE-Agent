# Implementation plan

## Current foundation

The repository starts as a pnpm/Turborepo workspace with:

- A strict TypeScript Fastify backend
- Environment validation with Zod
- Optional OpenTelemetry Node SDK initialization
- Health and system-information endpoints
- A React/Vite operations dashboard
- Backend and frontend smoke tests
- Jaeger and PostgreSQL in Docker Compose
- Shared build, test, type-check, lint, and format commands

## Milestone 1 — observable playground

### Deliverables

- Add `OrderService` and `PaymentService` packages.
- Propagate W3C trace context across service calls.
- Implement deterministic null, schema, and timeout fault switches.
- Route OTLP traffic through an explicit Collector configuration.
- Display the distributed failure trace in Jaeger.

### Completion gate

One scripted request produces a connected trace with an error span, exception details, service versions, and source-mapped application frames.

## Milestone 2 — incident ingestion

### Deliverables

- Define versioned telemetry and incident schemas in a shared contracts package.
- Add an incident ingestion endpoint and validation.
- Normalize exception messages and calculate fingerprints.
- Deduplicate repeated failures inside a time window.
- Persist incidents and occurrences in PostgreSQL.
- Add redaction rules before telemetry is retained or sent to a model.

### Completion gate

Repeated copies of the same failure produce one incident whose occurrence count and latest evidence update correctly.

## Milestone 3 — repository intelligence

### Deliverables

- Resolve service metadata to repository and deployed Git SHA.
- Create disposable read-only repository snapshots.
- Build a Tree-sitter symbol index for TypeScript.
- Implement exact stack-frame, symbol, import, test, and Git-history retrieval.
- Cache repository maps by commit SHA.
- Publish localization rankings and evidence explanations.

### Completion gate

The seeded faulty symbol appears in the top three candidates for every initial fault fixture.

## Milestone 4 — read-only diagnostic agent

### Deliverables

- Implement the typed repair state machine.
- Add a provider-neutral model gateway.
- Define read-only telemetry and repository tools.
- Enforce turn, token, cost, time, and tool-call budgets.
- Support code, configuration, dependency, infrastructure, and insufficient-evidence outcomes.
- Store every hypothesis, evidence item, tool result, and decision.

### Completion gate

The agent produces an evidence-backed diagnosis or explicit abstention without modifying the repository.

## Milestone 5 — sandboxed repair

### Deliverables

- Create an isolated writable checkout of the deployed revision.
- Build an allowlisted command catalog from repository configuration.
- Add patch, regression-test, format, test, build, and diff tools.
- Deny network access by default and remove production credentials.
- Enforce filesystem, process, memory, disk, and execution limits.
- Collect before-and-after reproduction results.

### Completion gate

Known incidents produce minimal patches that pass focused and hidden verification without unrelated file changes.

## Milestone 6 — MCP and policy enforcement

### Deliverables

- Wrap tool schemas with the MCP TypeScript SDK.
- Add repository-root path containment and canonicalization.
- Add permission classes, structured errors, and idempotency keys.
- Trace every agent turn and tool call with OpenTelemetry.
- Add a policy decision record to every mutating action.

### Completion gate

No model-generated input can read outside the repository, run a non-allowlisted command, or create external state without the correct policy decision.

## Milestone 7 — GitHub handoff

### Deliverables

- Register a least-privilege GitHub App.
- Create incident branches and signed or attributable commits.
- Publish GitHub check runs with test and risk results.
- Open draft pull requests with trace, cause, reproduction, patch, verification, and audit evidence.
- Make repeated PR-creation attempts idempotent.

### Completion gate

A verified repair opens exactly one draft PR against the intended repository and base revision.

## Milestone 8 — evaluation and hardening

### Deliverables

- Build at least 30 varied incident fixtures with hidden tests.
- Compare retrieval strategies, prompts, models, latency, cost, and abstention.
- Test prompt injection, secret leakage, path traversal, network policy, resource exhaustion, and workflow recovery.
- Add dashboards for localization, reproduction, correct-patch, regression, abstention, latency, and cost metrics.
- Run sanitized historical incidents in shadow mode.

### Completion gate

The published evaluation is reproducible from a clean checkout and clearly reports strengths, failure modes, and remaining risks.

## Issue ordering

Create GitHub issues in milestone order. Each issue should contain a concrete trigger, expected behavior, observable acceptance criteria, and relevant test or fixture. Avoid implementing multi-language indexing, embeddings, automatic merge, or deployment before the TypeScript incident-to-draft-PR path is measured end to end.

## Definition of done

A project change is complete when:

- Type checking, tests, build, and lint pass.
- Telemetry identifies the affected component and version.
- New behavior has a meaningful regression test when applicable.
- Security and permission implications are documented.
- User-facing or operator-facing behavior is documented.
- The change can be reproduced from a clean checkout.
