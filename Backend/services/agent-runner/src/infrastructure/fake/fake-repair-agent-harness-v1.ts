import { RepairAgentHarness } from "../../application/contracts/repair-agent-harness.js";
import type {
  DiagnoseIncidentRequest,
  RepairAgentCapabilities,
  RepairAgentEventObserver,
  RepairAgentRunResult,
} from "../../domain/repair-agent.js";

export class FakeRepairAgentHarnessV1 extends RepairAgentHarness {
  public override async diagnose(
    request: DiagnoseIncidentRequest,
    observer?: RepairAgentEventObserver,
  ): Promise<RepairAgentRunResult> {
    const event = {
      sequence: 0,
      kind: "agent.status" as const,
      name: "completed",
      data: { incidentId: request.incident.id },
    };
    observer?.(event);

    return {
      runId: request.repairRunId,
      harness: "fake",
      harnessVersion: "v1",
      provider: "deterministic",
      model: "fake-diagnostic-model",
      sessionId: `fake-${request.repairRunId}`,
      status: "completed",
      finalResponse: JSON.stringify({
        decision: "abstain",
        summary: `Fake harness does not diagnose incident ${request.incident.id}.`,
        changes: [],
      }),
      events: [event],
    };
  }

  public override getCapabilities(): RepairAgentCapabilities {
    return {
      harness: "fake",
      harnessVersion: "v1",
      modes: ["diagnosis"],
      streamingEvents: true,
      sessionResume: false,
      perRunCancellation: false,
      readOnlyWorkspace: true,
    };
  }
}
