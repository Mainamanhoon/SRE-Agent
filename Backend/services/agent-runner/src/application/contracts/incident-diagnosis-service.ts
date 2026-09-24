import type {
  DiagnoseIncidentRequest,
  RepairAgentCapabilities,
  RepairAgentEventObserver,
  RepairAgentRunOptions,
  RepairAgentRunResult,
} from "../../domain/repair-agent.js";

export abstract class IncidentDiagnosisService {
  public abstract diagnose(
    request: DiagnoseIncidentRequest,
    observer?: RepairAgentEventObserver,
    options?: RepairAgentRunOptions,
  ): Promise<RepairAgentRunResult>;

  public abstract getCapabilities(): RepairAgentCapabilities;
}
