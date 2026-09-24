# Core service deployment

`core-services.yaml` provides production-oriented resources for the control API, incident detector, and agent runner. `remaining-services.yaml` adds the incident migrations/service, Temporal repair workers, GitHub App delivery service, sandbox controller, and a two-replica file-queue-backed OpenTelemetry gateway.

Before applying it:

1. Replace every `registry.example/...:REPLACE_ME` image with an immutable image digest.
2. Create `sre-agent-service-auth` with different random values (at least 32 characters) for `control-api-token` and `internal-service-token`.
3. Create `sre-agent-model-provider` with `gemini-api-key`, preferably through an external secret operator rather than a checked-in Secret.
4. Provision the `agent-workspace` PVC with the repository snapshot for the run. It is mounted read-only.
5. Create `sre-agent-database` (`url`) and `sre-agent-github-app` (`app-id`, `private-key-base64`, `webhook-secret`). Mirror `sre-agent-service-auth` into `sre-agent-sandboxes` through the external-secret operator.
6. Build the incident migration image with `Dockerfile.migrate`, and build/publish the Node and Go sandbox images from the sandbox-executor Dockerfiles.
7. Apply the sandbox controller RBAC and NetworkPolicy. Install the configured runtime class (`gvisor` by default). Route sandbox TLS egress through an allowlisted package proxy in production.
8. Deploy Temporal, PostgreSQL, Jaeger, Loki, Prometheus, and an ingress that authenticates end users before the control API.
9. Install Metrics Server or replace the CPU HPAs with the platform's autoscaler/custom metrics.

The manifest intentionally contains no credentials or registry-specific settings. Apply namespaced core resources with `kubectl apply -n sre-agent`; sandbox resources declare their dedicated namespace. Replace every image placeholder with an immutable digest. Validate capacity in the target cluster with `Backend/load-tests`; 100,000 requests/minute is an ingestion/control-plane target, while repair and GitHub throughput remains intentionally limited by model, sandbox, Temporal, and provider quotas.
