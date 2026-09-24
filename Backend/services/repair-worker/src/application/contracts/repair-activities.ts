import type {
  DeliveryResult,
  DiagnosisResult,
  RepairPlan,
  RepairWorkflowInput,
  SandboxResult,
  SandboxState,
  TriageResult,
} from "../../contracts.js";

export abstract class RepairActivities {
  public abstract triageIncident(input: RepairWorkflowInput): Promise<TriageResult>;
  public abstract updateIncidentStatus(incidentId: string, status: string): Promise<void>;
  public abstract diagnoseIncident(input: RepairWorkflowInput): Promise<DiagnosisResult>;
  public abstract createRepairPlan(
    input: RepairWorkflowInput,
    diagnosis: DiagnosisResult,
  ): Promise<RepairPlan>;
  public abstract createSandbox(
    input: RepairWorkflowInput,
    plan: RepairPlan,
  ): Promise<SandboxState>;
  public abstract getSandbox(repairRunId: string): Promise<SandboxState>;
  public abstract getSandboxResult(repairRunId: string): Promise<SandboxResult>;
  public abstract deleteSandbox(repairRunId: string): Promise<void>;
  public abstract deliverRepair(
    input: RepairWorkflowInput,
    plan: RepairPlan,
    result: SandboxResult,
  ): Promise<DeliveryResult>;
}
