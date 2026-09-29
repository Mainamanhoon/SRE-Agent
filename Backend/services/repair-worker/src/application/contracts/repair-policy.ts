import type { RepairPlan, RepairWorkflowInput } from "../../contracts.js";

export interface PolicyDecision {
  allowed: boolean;
  reasonCode: string;
  summary: string;
  policyVersion: string;
  riskScore: number;
}

export abstract class RepairEligibilityPolicy {
  public abstract evaluate(input: RepairWorkflowInput): PolicyDecision;
}

export abstract class RepairChangePolicy {
  public abstract evaluate(input: RepairWorkflowInput, plan: RepairPlan): Promise<PolicyDecision>;
}

export abstract class DeliveryApprovalPolicy {
  public abstract evaluate(
    input: RepairWorkflowInput,
    plan: RepairPlan,
    riskScore: number,
  ): PolicyDecision;
}

export abstract class RiskScorer {
  public abstract score(input: RepairWorkflowInput, plan?: RepairPlan): number;
}

export abstract class RepositoryPolicySource {
  public abstract get(repository: string): Promise<RepositoryPolicy>;
}

export interface RepositoryPolicy {
  policyVersion: string;
  forbiddenPathPrefixes: string[];
  maxChangedFiles: number;
  maxChangedBytes: number;
  requireTestChange: boolean;
  maxRiskScoreForDraft: number;
}
