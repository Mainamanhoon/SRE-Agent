import type {
  DeliveryResult,
  DiagnosisResult,
  RepairPlan,
  RepairWorkflowInput,
  SandboxResult,
  SandboxState,
} from "../../contracts.js";

export abstract class RepairServiceGateway {
  public abstract updateIncidentStatus(incidentId: string, status: string): Promise<void>;
  public abstract diagnoseIncident(input: RepairWorkflowInput): Promise<DiagnosisResult>;
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
