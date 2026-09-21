import type { IncidentTriagePolicy } from "./application/contracts/incident-triage-policy.js";
import type { RepairActivities } from "./application/contracts/repair-activities.js";
import { RepairActivitiesV1 } from "./application/implementations/repair-activities-v1.js";
import { RequiredEvidenceTriagePolicyV1 } from "./application/implementations/required-evidence-triage-policy-v1.js";

export function createActivities(
  triagePolicy: IncidentTriagePolicy = new RequiredEvidenceTriagePolicyV1(),
): RepairActivities {
  const application = new RepairActivitiesV1(triagePolicy);
  return {
    triageIncident: application.triageIncident.bind(application),
  };
}
