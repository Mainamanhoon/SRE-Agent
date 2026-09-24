# OpenTelemetry Collector extension boundary

This service is configuration for the upstream OpenTelemetry Collector rather than project-owned application code. Its extension contracts are the Collector's native receiver, processor, exporter, connector, and extension interfaces.

The current implementation selected in `config.yaml` uses:

- OTLP receiver
- memory-limiter, shared resource, sensitive-attribute redaction, and batch processors
- durable file-backed sending queues with bounded retry for Jaeger, Loki, and Prometheus
- an unauthenticated OTLP ingress intended to be restricted to the application namespace by NetworkPolicy

Mount a writable volume at `/var/lib/otelcol`. Set `DEPLOYMENT_ENVIRONMENT` and use internal TLS (`OTEL_EXPORTER_INSECURE=false` plus exporter certificate configuration) in a production overlay. The checked-in Compose configuration uses plaintext only on its private Docker network.

To create a new implementation or version, add or replace a Collector component in `config.yaml`. A project-specific abstract class would not be executable by the Collector and would duplicate its plugin model.
