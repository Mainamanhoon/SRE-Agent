import Fastify, { type FastifyInstance } from "fastify";
import type { AgentReadinessProbe } from "./application/contracts/agent-readiness-probe.js";
import type { DiagnosisAdmissionController } from "./application/contracts/diagnosis-admission-controller.js";
import type { IncidentDiagnosisService } from "./application/contracts/incident-diagnosis-service.js";
import type { RepairToolCatalog } from "./application/contracts/repair-tool.js";
import type { RequestAuthenticator } from "./application/contracts/request-authenticator.js";
import { BearerTokenRequestAuthenticatorV1 } from "./application/implementations/bearer-token-request-authenticator-v1.js";
import { BoundedDiagnosisAdmissionControllerV1 } from "./application/implementations/bounded-diagnosis-admission-controller-v1.js";
import { ConfiguredAgentReadinessProbeV1 } from "./application/implementations/configured-agent-readiness-probe-v1.js";
import { DiagnosisPromptBuilderV1 } from "./application/implementations/diagnosis-prompt-builder-v1.js";
import { IncidentDiagnosisServiceV1 } from "./application/implementations/incident-diagnosis-service-v1.js";
import { RepairAgentHarnessRegistryV1 } from "./application/implementations/repair-agent-harness-registry-v1.js";
import { createRepairToolRuntime } from "./composition/repair-tool-runtime.js";
import type { AgentRunnerConfig } from "./config.js";
import { DeepSeekEventMapperV1 } from "./infrastructure/deepseek/deepseek-event-mapper-v1.js";
import { DeepSeekRepairAgentHarnessV1 } from "./infrastructure/deepseek/deepseek-repair-agent-harness-v1.js";
import { DeepSeekSdkRuntimeClientFactoryV1 } from "./infrastructure/deepseek/deepseek-sdk-runtime-client-v1.js";
import { FakeRepairAgentHarnessV1 } from "./infrastructure/fake/fake-repair-agent-harness-v1.js";
import { registerAgentRoutes } from "./presentation/register-agent-routes.js";

export interface AppDependencies {
  diagnoses: IncidentDiagnosisService;
  tools: RepairToolCatalog;
  admission: DiagnosisAdmissionController;
  authenticator: RequestAuthenticator;
  readiness: AgentReadinessProbe;
}

export function buildApp(
  config: AgentRunnerConfig,
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

  registerAgentRoutes(
    app,
    dependencies.diagnoses,
    dependencies.tools,
    dependencies.admission,
    dependencies.authenticator,
    dependencies.readiness,
    {
      serviceName: config.SERVICE_NAME,
      serviceVersion: config.SERVICE_VERSION,
    },
  );
  return app;
}

export function createDependencies(config: AgentRunnerConfig): AppDependencies {
  const registry = new RepairAgentHarnessRegistryV1([
    new DeepSeekRepairAgentHarnessV1(
      new DeepSeekSdkRuntimeClientFactoryV1(config),
      new DiagnosisPromptBuilderV1(),
      new DeepSeekEventMapperV1(),
      {
        provider: config.DEEPSEEK_PROVIDER,
        model: config.DEEPSEEK_MODEL,
      },
    ),
    new FakeRepairAgentHarnessV1(),
  ]);
  const tools = createRepairToolRuntime(config).catalog;

  return {
    diagnoses: new IncidentDiagnosisServiceV1(registry.resolve(config.AGENT_HARNESS)),
    tools,
    admission: new BoundedDiagnosisAdmissionControllerV1(
      config.MAX_CONCURRENT_DIAGNOSES,
      config.MAX_QUEUED_DIAGNOSES,
      config.DIAGNOSIS_TIMEOUT_MS,
    ),
    authenticator: new BearerTokenRequestAuthenticatorV1(
      config.API_AUTH_ENABLED,
      config.API_AUTH_TOKEN,
    ),
    readiness: new ConfiguredAgentReadinessProbeV1(config),
  };
}
