# OpenTelemetry Collector extension boundary

This service is configuration for the upstream OpenTelemetry Collector rather than project-owned application code. Its extension contracts are the Collector's native receiver, processor, exporter, connector, and extension interfaces.

The current implementation selected in `config.yaml` uses:

- OTLP receiver
- memory-limiter and batch processors
- OTLP exporter

To create a new implementation or version, add or replace a Collector component in `config.yaml`. A project-specific abstract class would not be executable by the Collector and would duplicate its plugin model.
