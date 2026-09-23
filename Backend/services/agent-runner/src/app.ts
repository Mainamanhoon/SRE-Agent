import Fastify, { type FastifyInstance } from "fastify";
import type { IncidentDiagnosisService } from "./application/contracts/incident-diagnosis-service.js";
import type { RepairToolCatalog } from "./application/contracts/repair-tool.js";
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
}

export function buildApp(
  config: AgentRunnerConfig,
  dependencies = createDependencies(config),
): FastifyInstance {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
  });

  registerAgentRoutes(app, dependencies.diagnoses, dependencies.tools, {
    serviceName: config.SERVICE_NAME,
    serviceVersion: config.SERVICE_VERSION,
  });
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
  };
}
