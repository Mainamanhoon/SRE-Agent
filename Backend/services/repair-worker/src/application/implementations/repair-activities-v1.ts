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
import type {
  DeliveryApprovalPolicy,
  PolicyDecision,
  RepairChangePolicy,
} from "../contracts/repair-policy.js";
import type {
  RepairRunEventInput,
  RepairRunProjectionGateway,
} from "../contracts/repair-run-projection-gateway.js";
import type { RepairServiceGateway } from "../contracts/repair-service-gateway.js";

export class RepairActivitiesV1 extends RepairActivities {
  public constructor(
    private readonly triagePolicy: IncidentTriagePolicy,
    private readonly gateway: RepairServiceGateway,
    private readonly plans: RepairPlanParser,
    private readonly repairRuns: RepairRunProjectionGateway,
    private readonly changePolicy: RepairChangePolicy,
    private readonly deliveryPolicy: DeliveryApprovalPolicy,
  ) {
    super();
  }
  public override createRepairRun(input: RepairWorkflowInput): Promise<void> {
    return this.repairRuns.create(input);
  }
  public override recordRepairRunEvent(input: RepairRunEventInput): Promise<void> {
    return this.repairRuns.appendEvent(input);
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
    const plan = this.plans.parse(input, diagnosis);
    const policy = await this.changePolicy.evaluate(input, plan);
    if (!policy.allowed)
      return {
        decision: "abstain",
        summary: `${policy.reasonCode}: ${policy.summary}`,
        changes: [],
      };
    return plan;
  }
  public override async evaluateDeliveryApproval(
    input: RepairWorkflowInput,
    plan: RepairPlan,
  ): Promise<PolicyDecision> {
    const riskScore = await this.changePolicy.evaluate(input, plan);
    return this.deliveryPolicy.evaluate(input, plan, riskScore.riskScore);
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
