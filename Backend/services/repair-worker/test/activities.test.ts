import { describe, expect, it } from "vitest";
import { RepairActivitiesV1 } from "../src/application/implementations/repair-activities-v1.js";
import { RequiredEvidenceTriagePolicyV1 } from "../src/application/implementations/required-evidence-triage-policy-v1.js";

describe("triageIncident", () => {
  it("abstains when deployed-version evidence is missing", async () => {
    const activities = new RepairActivitiesV1(new RequiredEvidenceTriagePolicyV1());
    const result = await activities.triageIncident({
      incidentId: "incident-1",
      fingerprint: "fingerprint-1",
      repository: "example/service",
      deployedCommit: "",
    });

    expect(result.eligible).toBe(false);
  });
});
