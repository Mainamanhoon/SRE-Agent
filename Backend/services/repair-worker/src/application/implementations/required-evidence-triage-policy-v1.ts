import type { RepairWorkflowInput, TriageResult } from "../../contracts.js";
import { IncidentTriagePolicy } from "../contracts/incident-triage-policy.js";
import { ConservativeRepairEligibilityPolicyV1 } from "./conservative-repair-policy-v1.js";

export class RequiredEvidenceTriagePolicyV1 extends IncidentTriagePolicy {
  public override async evaluate(input: RepairWorkflowInput): Promise<TriageResult> {
    if (
      !input.incidentId ||
      !input.fingerprint ||
      !input.repairRunId ||
      !input.repository ||
      !input.deployedCommit ||
      !input.installationId ||
      !input.incident ||
      !input.baseBranch
    ) {
      return {
        eligible: false,
        reason: "The incident is missing repository or deployed-version evidence.",
      };
    }

    const policy = new ConservativeRepairEligibilityPolicyV1().evaluate(input);
    if (!policy.allowed)
      return { eligible: false, reason: `${policy.reasonCode}: ${policy.summary}` };

    return {
      eligible: true,
      reason: `${policy.reasonCode}: ${policy.summary}`,
    };
  }
}
