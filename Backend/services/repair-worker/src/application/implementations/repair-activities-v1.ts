import type {
  DiagnosisResult,
  RepairPlan,
  RepairWorkflowInput,
  SandboxResult,
  TriageResult,
} from "../../contracts.js";
import type { IncidentTriagePolicy } from "../contracts/incident-triage-policy.js";
import { RepairActivities } from "../contracts/repair-activities.js";
import type { RepairPlanParser } from "../contracts/repair-plan-parser.js";
import type { RepairServiceGateway } from "../contracts/repair-service-gateway.js";

export class RepairActivitiesV1 extends RepairActivities {
  public constructor(
    private readonly triagePolicy: IncidentTriagePolicy,
    private readonly gateway: RepairServiceGateway,
    private readonly plans: RepairPlanParser,
  ) {
    super();
  }
  public override triageIncident(input: RepairWorkflowInput): Promise<TriageResult> {
    return this.triagePolicy.evaluate(input);
  }
  public override updateIncidentStatus(incidentId: string, status: string): Promise<void> {
    return this.gateway.updateIncidentStatus(incidentId, status);
  }
  public override diagnoseIncident(input: RepairWorkflowInput): Promise<DiagnosisResult> {
    return this.gateway.diagnoseIncident(input);
  }
  public override async createRepairPlan(
    input: RepairWorkflowInput,
    diagnosis: DiagnosisResult,
  ): Promise<RepairPlan> {
    return this.plans.parse(input, diagnosis);
  }
  public override createSandbox(input: RepairWorkflowInput, plan: RepairPlan) {
    return this.gateway.createSandbox(input, plan);
  }
  public override getSandbox(repairRunId: string) {
    return this.gateway.getSandbox(repairRunId);
  }
  public override getSandboxResult(repairRunId: string) {
    return this.gateway.getSandboxResult(repairRunId);
  }
  public override deleteSandbox(repairRunId: string) {
    return this.gateway.deleteSandbox(repairRunId);
  }
  public override deliverRepair(
    input: RepairWorkflowInput,
    plan: RepairPlan,
    result: SandboxResult,
  ) {
    return this.gateway.deliverRepair(input, plan, result);
  }
}
