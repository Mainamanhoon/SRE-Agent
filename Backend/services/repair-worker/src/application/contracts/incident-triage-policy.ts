import type { RepairWorkflowInput, TriageResult } from "../../contracts.js";

export abstract class IncidentTriagePolicy {
  public abstract evaluate(input: RepairWorkflowInput): Promise<TriageResult>;
}
