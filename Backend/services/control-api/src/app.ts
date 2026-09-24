import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { ControlApiQueryService } from "./application/contracts/control-api-query-service.js";
import type { ControlPlaneGateway } from "./application/contracts/control-plane-gateway.js";
import type { ControlPlaneReadinessProbe } from "./application/contracts/control-plane-readiness-probe.js";
import type { RepairWorkflowGateway } from "./application/contracts/repair-workflow-gateway.js";
import type { RequestAuthenticator } from "./application/contracts/request-authenticator.js";
import type { RequestRateLimiter } from "./application/contracts/request-rate-limiter.js";
import { BearerTokenRequestAuthenticatorV1 } from "./application/implementations/bearer-token-request-authenticator-v1.js";
import { ControlApiQueryServiceV1 } from "./application/implementations/control-api-query-service-v1.js";
import { TokenBucketRequestRateLimiterV1 } from "./application/implementations/token-bucket-request-rate-limiter-v1.js";
import type { AppConfig } from "./config.js";
import { FetchControlPlaneGatewayV1 } from "./infrastructure/http/fetch-control-plane-gateway-v1.js";
import { ConfiguredControlPlaneReadinessProbeV1 } from "./infrastructure/readiness/configured-control-plane-readiness-probe-v1.js";
import { SystemClock } from "./infrastructure/system-clock.js";
import { TemporalRepairWorkflowGatewayV1 } from "./infrastructure/temporal/temporal-repair-workflow-gateway-v1.js";
import { registerControlPlaneRoutes } from "./presentation/register-control-plane-routes.js";
import { registerRepairRoutes } from "./presentation/register-repair-routes.js";
import { registerSystemRoutes } from "./presentation/register-system-routes.js";

export interface AppDependencies {
  queries: ControlApiQueryService;
  gateway: ControlPlaneGateway;
  readiness: ControlPlaneReadinessProbe;
  authenticator: RequestAuthenticator;
  rateLimiter: RequestRateLimiter;
  workflows?: RepairWorkflowGateway;
}

export function buildApp(
  config: AppConfig,
  dependencies = createDependencies(config),
): FastifyInstance {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
    bodyLimit: config.BODY_LIMIT_BYTES,
    requestTimeout: config.REQUEST_TIMEOUT_MS,
    connectionTimeout: config.REQUEST_TIMEOUT_MS,
    keepAliveTimeout: 72_000,
    maxRequestsPerSocket: config.MAX_REQUESTS_PER_SOCKET,
  });

  void app.register(cors, {
    origin: config.FRONTEND_ORIGIN,
  });
  registerControlPlaneRoutes(
    app,
    dependencies.gateway,
    dependencies.readiness,
    dependencies.authenticator,
    dependencies.rateLimiter,
  );
  registerRepairRoutes(
    app,
    dependencies.workflows ??
      new TemporalRepairWorkflowGatewayV1({
        address: config.TEMPORAL_ADDRESS,
        namespace: config.TEMPORAL_NAMESPACE,
        taskQueue: config.TEMPORAL_TASK_QUEUE,
      }),
  );
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
    gateway: new FetchControlPlaneGatewayV1({
      incidentDetectorUrl: config.INCIDENT_DETECTOR_URL,
      incidentServiceUrl: config.INCIDENT_SERVICE_URL,
      agentRunnerUrl: config.AGENT_RUNNER_URL,
      serviceToken: config.INTERNAL_SERVICE_TOKEN,
      timeoutMs: config.DOWNSTREAM_TIMEOUT_MS,
      maxResponseBytes: config.DOWNSTREAM_MAX_RESPONSE_BYTES,
    }),
    readiness: new ConfiguredControlPlaneReadinessProbeV1({
      incidentDetectorUrl: config.INCIDENT_DETECTOR_URL,
      incidentServiceUrl: config.INCIDENT_SERVICE_URL,
      agentRunnerUrl: config.AGENT_RUNNER_URL,
      temporalAddress: config.TEMPORAL_ADDRESS,
      serviceToken: config.INTERNAL_SERVICE_TOKEN,
      timeoutMs: config.DOWNSTREAM_TIMEOUT_MS,
      requireAgentRunner: config.AGENT_RUNNER_REQUIRED,
    }),
    authenticator: new BearerTokenRequestAuthenticatorV1(config.API_AUTH_ENABLED, [
      config.API_AUTH_TOKEN,
      config.INTERNAL_SERVICE_TOKEN,
    ]),
    rateLimiter: new TokenBucketRequestRateLimiterV1(
      config.REQUESTS_PER_SECOND,
      config.REQUEST_BURST,
    ),
    workflows: new TemporalRepairWorkflowGatewayV1({
      address: config.TEMPORAL_ADDRESS,
      namespace: config.TEMPORAL_NAMESPACE,
      taskQueue: config.TEMPORAL_TASK_QUEUE,
    }),
  };
}
