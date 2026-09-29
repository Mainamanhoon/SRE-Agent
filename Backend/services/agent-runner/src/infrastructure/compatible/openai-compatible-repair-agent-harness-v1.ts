import { RepairAgentHarness } from "../../application/contracts/repair-agent-harness.js";
import type {
  DiagnoseIncidentRequest,
  RepairAgentCapabilities,
  RepairAgentEventObserver,
  RepairAgentRunOptions,
  RepairAgentRunResult,
} from "../../domain/repair-agent.js";

export interface CompatibleHarnessOptions {
  endpoint: string;
  apiKey: string;
  provider: string;
  model: string;
  version?: string;
  fetchImpl?: typeof fetch;
}

/** OpenAI-compatible HTTP adapter for OpenAI, Anthropic gateways, Gemini
 * proxies, or self-hosted models. It intentionally has no provider SDK. */
export class OpenAICompatibleRepairAgentHarnessV1 extends RepairAgentHarness {
  private readonly fetchImpl: typeof fetch;
  public constructor(private readonly options: CompatibleHarnessOptions) {
    super();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  public getCapabilities(): RepairAgentCapabilities {
    return {
      harness: "openai-compatible",
      harnessVersion: this.options.version ?? "v1",
      modes: ["diagnosis"],
      streamingEvents: false,
      sessionResume: false,
      perRunCancellation: true,
      readOnlyWorkspace: true,
    };
  }
  public async diagnose(
    request: DiagnoseIncidentRequest,
    observer?: RepairAgentEventObserver,
    options?: RepairAgentRunOptions,
  ): Promise<RepairAgentRunResult> {
    const response = await this.fetchImpl(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          {
            role: "system",
            content: "You are a read-only SRE diagnosis agent. Do not propose destructive actions.",
          },
          { role: "user", content: JSON.stringify(request) },
        ],
        temperature: 0,
      }),
      signal: options?.signal,
    });
    if (!response.ok)
      throw new Error(`compatible model request failed with status ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const finalResponse = payload.choices?.[0]?.message?.content;
    if (typeof finalResponse !== "string" || finalResponse.length === 0)
      throw new Error("compatible model returned no content");
    const event = {
      sequence: 1,
      kind: "agent.message" as const,
      name: "final",
      data: { provider: this.options.provider, model: this.options.model },
    };
    observer?.(event);
    return {
      runId: request.repairRunId,
      harness: "openai-compatible",
      harnessVersion: this.options.version ?? "v1",
      provider: this.options.provider,
      model: this.options.model,
      sessionId: request.repairRunId,
      status: "completed",
      finalResponse,
      events: [event],
    };
  }
}
