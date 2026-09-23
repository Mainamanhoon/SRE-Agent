import type {
  DiagnoseIncidentRequest,
  RepairAgentCapabilities,
  RepairAgentEventObserver,
  RepairAgentRunResult,
} from "../../domain/repair-agent.js";

export abstract class IncidentDiagnosisService {
  public abstract diagnose(
    request: DiagnoseIncidentRequest,
    observer?: RepairAgentEventObserver,
  ): Promise<RepairAgentRunResult>;

  public abstract getCapabilities(): RepairAgentCapabilities;
}
