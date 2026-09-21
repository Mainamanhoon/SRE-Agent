import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { ControlApiQueryService } from "./application/contracts/control-api-query-service.js";
import { ControlApiQueryServiceV1 } from "./application/implementations/control-api-query-service-v1.js";
import type { AppConfig } from "./config.js";
import { SystemClock } from "./infrastructure/system-clock.js";
import { registerSystemRoutes } from "./presentation/register-system-routes.js";

export interface AppDependencies {
  queries: ControlApiQueryService;
}

export function buildApp(
  config: AppConfig,
  dependencies = createDependencies(config),
): FastifyInstance {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
  });

  void app.register(cors, {
    origin: config.FRONTEND_ORIGIN,
  });
  registerSystemRoutes(app, dependencies.queries);

  return app;
}

function createDependencies(config: AppConfig): AppDependencies {
  return {
    queries: new ControlApiQueryServiceV1(
      {
        serviceName: config.SERVICE_NAME,
        serviceVersion: config.SERVICE_VERSION,
        environment: config.NODE_ENV,
        incidentDetectorUrl: config.INCIDENT_DETECTOR_URL,
        incidentServiceUrl: config.INCIDENT_SERVICE_URL,
        temporalAddress: config.TEMPORAL_ADDRESS,
      },
      new SystemClock(),
    ),
  };
}
