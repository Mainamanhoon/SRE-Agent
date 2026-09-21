import type { RepairWorkflowInput, TriageResult } from "../../contracts.js";

export abstract class RepairActivities {
  public abstract triageIncident(input: RepairWorkflowInput): Promise<TriageResult>;
}
