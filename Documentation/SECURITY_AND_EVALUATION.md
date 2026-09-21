# Security and evaluation plan

## Trust boundaries

Treat telemetry payloads, log messages, repository files, comments, dependencies, test output, model responses, and generated commands as untrusted. The model proposes actions; executable policy decides whether those actions are permitted.

## Initial sandbox policy

- Create one disposable workspace per repair run.
- Check out the exact deployed commit.
- Run as a non-root identity.
- Mount no cloud, production, developer, or GitHub credentials.
- Deny network access by default.
- Permit only repository-declared commands.
- Restrict paths to the workspace root.
- Limit CPU, memory, disk, process count, output size, and wall time.
- Preserve the final diff and verification artifacts, then destroy the workspace.

## Model data policy

- Redact authorization data, cookies, secrets, personal data, and configured payload fields before remote calls.
- Store sanitized evidence separately from restricted raw telemetry.
- Keep prompts, model IDs, parameters, tool schemas, and policy versions in every repair record.
- Never grant the model direct credentials or an unrestricted network client.

## Source-control policy

- Use short-lived GitHub App installation tokens.
- Scope permissions to repository contents, pull requests, metadata, and checks only as required.
- Create a dedicated incident branch from the deployed or approved base revision.
- Open draft pull requests during the initial autonomy level.
- Preserve branch protection, required checks, and human review.

## Incident evaluation fixture

Each fixture must include:

- Repository and exact commit
- Service container definitions
- Deterministic failure trigger
- Sanitized trace and log bundle
- Expected faulty files or symbols
- Hidden reproduction and regression tests
- Optional reference patch
- Fault category and difficulty

## Fault coverage

- Null and undefined inputs
- Cross-service schema drift
- Validation errors
- Retry and timeout mistakes
- Resource leaks
- Race conditions
- Feature-flag and environment errors
- Database constraint failures
- Authentication and authorization regressions
- External dependency and infrastructure failures that should cause abstention

## Primary metrics

- Code versus non-code incident classification
- Top-1 and top-3 localization accuracy
- Reproduction success
- Patch application and correct-patch rates
- Hidden-test and regression outcomes
- Abstention precision and recall
- Unrelated file changes
- Median diagnosis and verified-patch time
- Tokens, tool calls, and cost per successful repair
- Draft-PR acceptance, edits, rejection, and merge outcomes

## Release gates

The agent may open draft pull requests only when it resolves the deployed source version, has sufficient localized evidence, respects all tool budgets, produces an allowed diff, and passes the configured verification ladder. Any missing gate returns a structured `NEEDS_HUMAN`, `ABSTAINED`, or `FAILED` outcome.

Automatic merge and deployment require a separate threat model, repository-specific risk allowlist, rollback mechanism, production canary analysis, and sustained shadow-mode evidence. They are outside the initial project target.
