# Projection reconciliation

Repair-run and incident projections are treated as eventually consistent read
models. A scheduled reconciler must scan terminal workflow IDs, compare the
workflow history with the projection cursor, and replay missing idempotent
events. It must use a bounded page, a lease, and an idempotency key per event.

The `RepairRunProjectionGateway` and `RepairRunProjection` contracts are the
replaceable application boundary. The production scheduler (Kubernetes CronJob
or Temporal schedule) is intentionally deployment-specific; the alert
`SREAgentRepairProjectionLag` is the acceptance signal.
