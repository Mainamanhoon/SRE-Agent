import { describe, expect, it, vi } from "vitest";
import { DiagnosisPromptBuilderV1 } from "../src/application/implementations/diagnosis-prompt-builder-v1.js";
import { DeepSeekEventMapperV1 } from "../src/infrastructure/deepseek/deepseek-event-mapper-v1.js";
import { DeepSeekRepairAgentHarnessV1 } from "../src/infrastructure/deepseek/deepseek-repair-agent-harness-v1.js";
import {
  type DeepSeekRunOptions,
  DeepSeekRuntimeClient,
  DeepSeekRuntimeClientFactory,
  type DeepSeekRuntimeLaunchContext,
} from "../src/infrastructure/deepseek/deepseek-runtime-client.js";
import { selectHarnessEnvironment } from "../src/infrastructure/deepseek/deepseek-sdk-runtime-client-v1.js";

class StubClient extends DeepSeekRuntimeClient {
  public readonly close = vi.fn(async () => undefined);

  public override async run(_input: string, options: DeepSeekRunOptions) {
    options.onNotification({
      method: "session.event",
      params: { event: { type: "assistant/message", data: { text: "diagnosis" } } },
    });
    return { sessionId: options.sessionId, finalResponse: "Root cause is in parser.ts" };
  }
}

class StubClientFactory extends DeepSeekRuntimeClientFactory {
  public constructor(public readonly client: StubClient) {
    super();
  }

  public override create(_context: DeepSeekRuntimeLaunchContext): DeepSeekRuntimeClient {
    return this.client;
  }
}

describe("DeepSeekRepairAgentHarnessV1", () => {
  it("does not inherit unrelated parent-process secrets", () => {
    expect(
      selectHarnessEnvironment({
        PATH: "/bin",
        GEMINI_API_KEY: "provider-key",
        KUBERNETES_SERVICE_HOST: "10.0.0.1",
        UNRELATED_DATABASE_PASSWORD: "must-not-cross-boundary",
      }),
    ).toEqual({
      PATH: "/bin",
      GEMINI_API_KEY: "provider-key",
      KUBERNETES_SERVICE_HOST: "10.0.0.1",
    });
  });

  it("normalizes the SDK result and always closes the runtime", async () => {
    const client = new StubClient();
    const harness = new DeepSeekRepairAgentHarnessV1(
      new StubClientFactory(client),
      new DiagnosisPromptBuilderV1(),
      new DeepSeekEventMapperV1(),
      { provider: "deepseek-official", model: "test-model" },
    );

    const result = await harness.diagnose({
      repairRunId: "run-1",
      incident: {
        id: "incident-1",
        serviceName: "checkout",
        environment: "production",
        exceptionType: "TypeError",
        exceptionMessage: "Cannot read properties of undefined",
      },
      evidence: [],
    });

    expect(result).toMatchObject({
      harness: "deepseek",
      model: "test-model",
      sessionId: "repair-run-1",
      finalResponse: "Root cause is in parser.ts",
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.kind).toBe("agent.message");
    expect(client.close).toHaveBeenCalledOnce();
  });
});
