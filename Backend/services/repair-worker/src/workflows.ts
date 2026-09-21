import { proxyActivities } from "@temporalio/workflow";
import type { RepairActivities } from "./application/contracts/repair-activities.js";
import type { RepairWorkflowInput, RepairWorkflowResult } from "./contracts.js";

const { triageIncident } = proxyActivities<RepairActivities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3,
  },
});

export async function repairWorkflow(input: RepairWorkflowInput): Promise<RepairWorkflowResult> {
  const triage = await triageIncident(input);
  if (!triage.eligible) {
    return {
      incidentId: input.incidentId,
      status: "abstained",
      reason: triage.reason,
    };
  }

  return {
    incidentId: input.incidentId,
    status: "awaiting_evidence",
    reason: "Triage passed; repository retrieval and sandbox activities are not enabled yet.",
  };
}
