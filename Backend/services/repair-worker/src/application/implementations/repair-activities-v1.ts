import type { RepairWorkflowInput, TriageResult } from "../../contracts.js";
import type { IncidentTriagePolicy } from "../contracts/incident-triage-policy.js";
import { RepairActivities } from "../contracts/repair-activities.js";

export class RepairActivitiesV1 extends RepairActivities {
  public constructor(private readonly triagePolicy: IncidentTriagePolicy) {
    super();
  }

  public override async triageIncident(input: RepairWorkflowInput): Promise<TriageResult> {
    return this.triagePolicy.evaluate(input);
  }
}
