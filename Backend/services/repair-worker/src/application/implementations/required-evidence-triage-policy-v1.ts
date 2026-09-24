import type { RepairWorkflowInput, TriageResult } from "../../contracts.js";
import { IncidentTriagePolicy } from "../contracts/incident-triage-policy.js";

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

    return {
      eligible: true,
      reason: "The incident has enough identity and source-version evidence to continue.",
    };
  }
}
