import type { DiagnosisPromptBuilder } from "../../application/contracts/diagnosis-prompt-builder.js";
import { RepairAgentHarness } from "../../application/contracts/repair-agent-harness.js";
import type {
  DiagnoseIncidentRequest,
  RepairAgentCapabilities,
  RepairAgentEvent,
  RepairAgentEventObserver,
  RepairAgentRunOptions,
  RepairAgentRunResult,
} from "../../domain/repair-agent.js";
import type { DeepSeekEventMapperV1 } from "./deepseek-event-mapper-v1.js";
import type { DeepSeekRuntimeClientFactory } from "./deepseek-runtime-client.js";

export interface DeepSeekHarnessIdentity {
  provider: string;
  model: string;
}

export class DeepSeekRepairAgentHarnessV1 extends RepairAgentHarness {
  public constructor(
    private readonly clients: DeepSeekRuntimeClientFactory,
    private readonly prompts: DiagnosisPromptBuilder,
    private readonly eventMapper: DeepSeekEventMapperV1,
    private readonly identity: DeepSeekHarnessIdentity,
  ) {
    super();
  }

  public override async diagnose(
    request: DiagnoseIncidentRequest,
    observer?: RepairAgentEventObserver,
    options?: RepairAgentRunOptions,
  ): Promise<RepairAgentRunResult> {
    const client = this.clients.create({ repairRunId: request.repairRunId });
    const events: RepairAgentEvent[] = [];
    let sequence = 0;

    try {
      const result = await raceWithAbort(
        client.run(this.prompts.build(request), {
          sessionId: `repair-${request.repairRunId}`,
          onNotification: (notification) => {
            const event = this.eventMapper.map(notification, sequence);
            sequence += 1;
            events.push(event);
            observer?.(event);
          },
        }),
        options?.signal,
      );

      return {
        runId: request.repairRunId,
        harness: "deepseek",
        harnessVersion: "v1",
        provider: this.identity.provider,
        model: this.identity.model,
        sessionId: result.sessionId,
        status: "completed",
        finalResponse: result.finalResponse,
        events,
      };
    } finally {
      await client.close();
    }
  }

  public override getCapabilities(): RepairAgentCapabilities {
    return {
      harness: "deepseek",
      harnessVersion: "v1",
      modes: ["diagnosis"],
      streamingEvents: true,
      sessionResume: false,
      perRunCancellation: true,
      readOnlyWorkspace: true,
    };
  }
}

function raceWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return operation;
  }
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("agent run was cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
