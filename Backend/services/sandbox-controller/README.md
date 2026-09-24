# Sandbox controller

The controller exposes authenticated create/get/result/delete operations for repair sandboxes. `SandboxProvisioner`, `ToolchainImageResolver`, and the narrow inbound interfaces keep Kubernetes replaceable by another execution platform.

Each `repairRunId` maps to a deterministic Job and immutable task hash. The Kubernetes implementation stores the bounded task and source credential in a mounted Secret, disables service-account token mounting, drops all capabilities, enforces non-root/seccomp/read-only-root execution, and applies CPU, memory, storage, deadline, retry, and TTL limits. A repeated identical task returns the same Job; a different task with the same ID returns `409`.

The executor result is read from the terminal pod's `SRE_AGENT_RESULT=<json>` log record. Apply `deploy/rbac.yaml` and `deploy/network-policy.yaml`; install the configured runtime class (gVisor by default) and publish both project-owned sandbox executor images first.
