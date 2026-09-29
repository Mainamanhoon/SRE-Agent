import type { RepairPlan, RepairWorkflowInput } from "../../contracts.js";
import {
  DeliveryApprovalPolicy,
  type PolicyDecision,
  RepairChangePolicy,
  RepairEligibilityPolicy,
  type RepositoryPolicy,
  RepositoryPolicySource,
  RiskScorer,
} from "../contracts/repair-policy.js";

export const DEFAULT_REPAIR_POLICY: RepositoryPolicy = {
  policyVersion: "conservative-v1",
  forbiddenPathPrefixes: [
    ".github/workflows/",
    "infra/",
    "infrastructure/",
    "terraform/",
    "migrations/",
    "db/migrations/",
    "vendor/",
    "node_modules/",
  ],
  maxChangedFiles: 12,
  maxChangedBytes: 200_000,
  requireTestChange: false,
  maxRiskScoreForDraft: 0.65,
};

export class RepositoryFilePolicySourceV1 extends RepositoryPolicySource {
  public override async get(_repository: string): Promise<RepositoryPolicy> {
    return {
      ...DEFAULT_REPAIR_POLICY,
      forbiddenPathPrefixes: [...DEFAULT_REPAIR_POLICY.forbiddenPathPrefixes],
    };
  }
}

export class WeightedRepairRiskScorerV1 extends RiskScorer {
  public override score(input: RepairWorkflowInput, plan?: RepairPlan): number {
    let score = input.incident.environment === "production" ? 0.2 : 0.05;
    if (input.incident.serviceName.toLowerCase().includes("auth")) score += 0.25;
    if (input.incident.serviceName.toLowerCase().includes("payment")) score += 0.25;
    if (plan) {
      score += Math.min(plan.changes.length / 20, 0.3);
      if (plan.changes.some((change) => change.delete)) score += 0.2;
      if (
        plan.changes.some((change) =>
          /(^|\/)(package-lock|pnpm-lock|go\.sum|go\.mod)$/.test(change.path),
        )
      )
        score += 0.15;
    }
    return Math.min(1, Number(score.toFixed(3)));
  }
}

function decision(
  allowed: boolean,
  reasonCode: string,
  summary: string,
  riskScore: number,
): PolicyDecision {
  return {
    allowed,
    reasonCode,
    summary,
    policyVersion: DEFAULT_REPAIR_POLICY.policyVersion,
    riskScore,
  };
}

export class ConservativeRepairEligibilityPolicyV1 extends RepairEligibilityPolicy {
  public override evaluate(input: RepairWorkflowInput): PolicyDecision {
    if (!input.repository || input.installationId <= 0)
      return decision(
        false,
        "INVALID_REPOSITORY_CONTEXT",
        "Repository installation context is incomplete.",
        1,
      );
    if (!input.deployedCommit)
      return decision(
        false,
        "MISSING_EXPECTED_COMMIT",
        "The expected deployed commit is required.",
        1,
      );
    if (input.incident.environment.toLowerCase() !== "production")
      return decision(
        false,
        "ENVIRONMENT_NOT_ELIGIBLE",
        "Only production incidents are eligible by the default policy.",
        0.4,
      );
    if (input.evidence.length === 0)
      return decision(
        false,
        "INSUFFICIENT_EVIDENCE",
        "At least one bounded evidence item is required.",
        0.8,
      );
    return decision(
      true,
      "ELIGIBLE",
      "Incident meets conservative repair eligibility policy.",
      new WeightedRepairRiskScorerV1().score(input),
    );
  }
}

export class PathAndSizeRepairChangePolicyV1 extends RepairChangePolicy {
  public constructor(
    private readonly source: RepositoryPolicySource = new RepositoryFilePolicySourceV1(),
  ) {
    super();
  }
  public override async evaluate(
    input: RepairWorkflowInput,
    plan: RepairPlan,
  ): Promise<PolicyDecision> {
    const policy = await this.source.get(input.repository);
    const risk = new WeightedRepairRiskScorerV1().score(input, plan);
    if (plan.decision !== "repair")
      return decision(
        false,
        "PLAN_ABSTAINED",
        "The harness abstained from proposing a repair.",
        risk,
      );
    if (plan.changes.length > policy.maxChangedFiles)
      return decision(
        false,
        "TOO_MANY_CHANGED_FILES",
        `Repair plan exceeds ${policy.maxChangedFiles} changed files.`,
        risk,
      );
    let bytes = 0;
    for (const change of plan.changes) {
      bytes += Buffer.byteLength(change.content ?? "");
      if (
        policy.forbiddenPathPrefixes.some(
          (prefix) => change.path === prefix.slice(0, -1) || change.path.startsWith(prefix),
        )
      )
        return decision(
          false,
          "FORBIDDEN_PATH",
          `Repair plan touches a protected path: ${change.path}.`,
          risk,
        );
    }
    if (bytes > policy.maxChangedBytes)
      return decision(
        false,
        "TOO_MANY_CHANGED_BYTES",
        "Repair plan exceeds the configured change size.",
        risk,
      );
    if (
      policy.requireTestChange &&
      !plan.changes.some((change) => /(^|\/)(test|tests|__tests__)(\/|\.)/.test(change.path))
    )
      return decision(
        false,
        "TEST_CHANGE_REQUIRED",
        "A test change is required by repository policy.",
        risk,
      );
    return decision(true, "PLAN_ALLOWED", "Repair plan passes path and size policy.", risk);
  }
}

export class DraftPullRequestApprovalPolicyV1 extends DeliveryApprovalPolicy {
  public override evaluate(
    input: RepairWorkflowInput,
    plan: RepairPlan,
    riskScore: number,
  ): PolicyDecision {
    if (
      riskScore > DEFAULT_REPAIR_POLICY.maxRiskScoreForDraft ||
      plan.changes.some((change) => change.delete)
    )
      return decision(
        false,
        "HUMAN_APPROVAL_REQUIRED",
        "Risk score or deletion requires explicit human approval before delivery.",
        riskScore,
      );
    return decision(
      true,
      "DRAFT_DELIVERY_ALLOWED",
      `Draft delivery is allowed for ${input.repository}; auto-merge remains disabled.`,
      riskScore,
    );
  }
}
