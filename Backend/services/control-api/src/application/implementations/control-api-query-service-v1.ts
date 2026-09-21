import type { ControlApiSettings, HealthView, SystemView } from "../../domain/system.js";
import type { Clock } from "../contracts/clock.js";
import { ControlApiQueryService } from "../contracts/control-api-query-service.js";

export class ControlApiQueryServiceV1 extends ControlApiQueryService {
  public constructor(
    private readonly settings: ControlApiSettings,
    private readonly clock: Clock,
  ) {
    super();
  }

  public override getHealth(): HealthView {
    return {
      status: "ok",
      service: this.settings.serviceName,
      version: this.settings.serviceVersion,
      environment: this.settings.environment,
      timestamp: this.clock.now().toISOString(),
    };
  }

  public override getSystem(): SystemView {
    return {
      name: "Autonomous Self-Healing SRE Agent",
      stage: "foundation",
      capabilities: [
        "telemetry-ingestion",
        "incident-correlation",
        "repository-indexing",
        "sandboxed-repair",
        "pull-request-handoff",
      ],
      services: {
        incidentDetector: this.settings.incidentDetectorUrl,
        incidentService: this.settings.incidentServiceUrl,
        temporal: this.settings.temporalAddress,
      },
    };
  }
}
