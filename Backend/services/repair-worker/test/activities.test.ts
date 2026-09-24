import { describe, expect, it } from "vitest";
import { JsonRepairPlanParserV1 } from "../src/application/implementations/json-repair-plan-parser-v1.js";
import { RequiredEvidenceTriagePolicyV1 } from "../src/application/implementations/required-evidence-triage-policy-v1.js";
import type { RepairWorkflowInput } from "../src/contracts.js";

const input: RepairWorkflowInput = {
  incidentId: "incident-1",
  fingerprint: "fingerprint-1",
  repairRunId: "run-1",
  installationId: 42,
  repository: "example/service",
  deployedCommit: "abcdef1234567",
  baseBranch: "main",
  toolchain: "node",
  incident: {
    id: "incident-1",
    serviceName: "service",
    environment: "production",
    exceptionType: "TypeError",
    exceptionMessage: "boom",
    deployedRevision: "abcdef1234567",
  },
  evidence: [],
};

describe("repair policies", () => {
  it("abstains when deployed-version evidence is missing", async () => {
    const result = await new RequiredEvidenceTriagePolicyV1().evaluate({
      ...input,
      deployedCommit: "",
    });
    expect(result.eligible).toBe(false);
  });

  it("parses a bounded structured repair plan", () => {
    const plan = new JsonRepairPlanParserV1().parse(input, {
      harness: "deepseek",
      model: "gemini",
      finalResponse: JSON.stringify({
        decision: "repair",
        summary: "Guard missing input",
        changes: [{ path: "src/app.ts", content: "export const fixed = true;" }],
      }),
    });
    expect(plan.changes[0]?.path).toBe("src/app.ts");
  });

  it("rejects path traversal in a model response", () => {
    expect(() =>
      new JsonRepairPlanParserV1().parse(input, {
        harness: "deepseek",
        model: "gemini",
        finalResponse: JSON.stringify({
          decision: "repair",
          summary: "bad",
          changes: [{ path: "../secret", content: "x" }],
        }),
      }),
    ).toThrow();
  });
});
