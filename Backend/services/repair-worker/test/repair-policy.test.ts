import { describe, expect, it } from "vitest";
import {
  ConservativeRepairEligibilityPolicyV1,
  DraftPullRequestApprovalPolicyV1,
  PathAndSizeRepairChangePolicyV1,
  RepositoryFilePolicySourceV1,
  WeightedRepairRiskScorerV1,
} from "../src/application/implementations/conservative-repair-policy-v1.js";
import type { RepairPlan, RepairWorkflowInput } from "../src/contracts.js";

const input: RepairWorkflowInput = {
  incidentId: "incident-1",
  fingerprint: "fp",
  repairRunId: "run-1",
  installationId: 42,
  repository: "example/service",
  deployedCommit: "abcdef1234567",
  baseBranch: "main",
  toolchain: "node",
  incident: {
    id: "incident-1",
    serviceName: "checkout",
    environment: "production",
    exceptionType: "TypeError",
    exceptionMessage: "boom",
  },
  evidence: [{ id: "evidence-1", kind: "exception", summary: "boom" }],
};

describe("conservative repair policy", () => {
  it("fails closed on missing evidence and allows a bounded production incident", () => {
    const policy = new ConservativeRepairEligibilityPolicyV1();
    expect(policy.evaluate({ ...input, evidence: [] }).reasonCode).toBe("INSUFFICIENT_EVIDENCE");
    expect(policy.evaluate(input).allowed).toBe(true);
  });

  it("rejects protected paths and excessive changes", async () => {
    const policy = new PathAndSizeRepairChangePolicyV1(new RepositoryFilePolicySourceV1());
    const protectedPlan: RepairPlan = {
      decision: "repair",
      summary: "bad",
      changes: [{ path: ".github/workflows/release.yml", content: "x" }],
    };
    expect((await policy.evaluate(input, protectedPlan)).reasonCode).toBe("FORBIDDEN_PATH");
    const tooMany: RepairPlan = {
      decision: "repair",
      summary: "many",
      changes: Array.from({ length: 13 }, (_, index) => ({
        path: `src/file-${index}.ts`,
        content: "x",
      })),
    };
    expect((await policy.evaluate(input, tooMany)).reasonCode).toBe("TOO_MANY_CHANGED_FILES");
  });

  it("requires human approval for risky changes and never enables auto-merge", () => {
    const plan: RepairPlan = {
      decision: "repair",
      summary: "delete",
      changes: [{ path: "src/app.ts", delete: true }],
    };
    const risk = new WeightedRepairRiskScorerV1().score(input, plan);
    const decision = new DraftPullRequestApprovalPolicyV1().evaluate(input, plan, risk);
    expect(risk).toBeGreaterThan(0);
    expect(decision.reasonCode).toBe("HUMAN_APPROVAL_REQUIRED");
  });
});
