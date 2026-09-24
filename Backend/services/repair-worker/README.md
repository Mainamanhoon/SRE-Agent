# Repair worker

This Temporal worker owns durable repair orchestration:

1. deterministic evidence triage;
2. incident transition to `investigating`;
3. read-only agent diagnosis and strict structured-plan validation;
4. incident transition to `repairing`;
5. idempotent isolated sandbox creation and bounded status polling;
6. verification-result validation against the deployed commit;
7. idempotent GitHub draft-PR delivery;
8. incident transition to `awaiting_review` and non-cancellable sandbox cleanup.

`RepairActivities`, `RepairServiceGateway`, `RepairPlanParser`, and `IncidentTriagePolicy` are independently replaceable contracts. Temporal retries transient activities; invalid plans and failed verification do not reach GitHub. The worker exposes `/health/live` and `/health/ready` on port 4060.

The fake agent harness intentionally returns an abstention and must not be used to assess repair quality. Select the real harness for end-to-end runs.
