import type { DiagnosisResult, RepairPlan, RepairWorkflowInput } from "../../contracts.js";
export abstract class RepairPlanParser {
  public abstract parse(input: RepairWorkflowInput, diagnosis: DiagnosisResult): RepairPlan;
}
