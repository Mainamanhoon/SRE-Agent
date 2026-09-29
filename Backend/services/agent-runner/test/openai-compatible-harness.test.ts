import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleRepairAgentHarnessV1 } from "../src/infrastructure/compatible/openai-compatible-repair-agent-harness-v1.js";

describe("OpenAICompatibleRepairAgentHarnessV1", () => {
  it("normalizes an OpenAI-compatible response and emits an event", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "diagnosis" } }] }), {
        status: 200,
      }),
    );
    const harness = new OpenAICompatibleRepairAgentHarnessV1({
      endpoint: "https://model.test/v1/chat/completions",
      apiKey: "secret",
      provider: "test",
      model: "model",
      fetchImpl,
    });
    const result = await harness.diagnose({
      repairRunId: "run-1",
      incident: {
        id: "i",
        serviceName: "svc",
        environment: "production",
        exceptionType: "Error",
        exceptionMessage: "boom",
      },
      evidence: [],
    });
    expect(result.finalResponse).toBe("diagnosis");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
