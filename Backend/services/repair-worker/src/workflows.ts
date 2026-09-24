import {
  ApplicationFailure,
  CancellationScope,
  proxyActivities,
  sleep,
} from "@temporalio/workflow";
import type { RepairActivities } from "./application/contracts/repair-activities.js";
import type { RepairWorkflowInput, RepairWorkflowResult } from "./contracts.js";

const activities = proxyActivities<RepairActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumInterval: "30 seconds",
    maximumAttempts: 5,
  },
});

const longActivities = proxyActivities<RepairActivities>({
  startToCloseTimeout: "16 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "1 minute",
    maximumAttempts: 3,
  },
});

export async function repairWorkflow(input: RepairWorkflowInput): Promise<RepairWorkflowResult> {
  const triage = await activities.triageIncident(input);
  if (!triage.eligible)
    return {
      incidentId: input.incidentId,
      repairRunId: input.repairRunId,
      status: "abstained",
      reason: triage.reason,
    };

  let sandboxCreated = false;
  try {
    await activities.updateIncidentStatus(input.incidentId, "investigating");
    const diagnosis = await longActivities.diagnoseIncident(input);
    const plan = await activities.createRepairPlan(input, diagnosis);
    if (plan.decision === "abstain") {
      await activities.updateIncidentStatus(input.incidentId, "abstained");
      return {
        incidentId: input.incidentId,
        repairRunId: input.repairRunId,
        status: "abstained",
        reason: plan.summary,
      };
    }

    await activities.updateIncidentStatus(input.incidentId, "repairing");
    await activities.createSandbox(input, plan);
    sandboxCreated = true;
    let state = await activities.getSandbox(input.repairRunId);
    for (
      let attempt = 0;
      attempt < 90 && state.status !== "succeeded" && state.status !== "failed";
      attempt += 1
    ) {
      await sleep("10 seconds");
      state = await activities.getSandbox(input.repairRunId);
    }
    if (state.status !== "succeeded")
      throw ApplicationFailure.nonRetryable(
        state.reason ?? "sandbox verification failed",
        "SANDBOX_FAILED",
      );
    const verification = await activities.getSandboxResult(input.repairRunId);
    if (
      verification.status !== "succeeded" ||
      verification.expectedCommit !== input.deployedCommit ||
      verification.checks.some((check) => !check.successful)
    )
      throw ApplicationFailure.nonRetryable(
        verification.reason ?? "sandbox result was not successful",
        "VERIFICATION_FAILED",
      );
    const delivery = await activities.deliverRepair(input, plan, verification);
    await activities.updateIncidentStatus(input.incidentId, "awaiting_review");
    return {
      incidentId: input.incidentId,
      repairRunId: input.repairRunId,
      status: "pull_request_created",
      reason: plan.summary,
      pullRequestUrl: delivery.pullRequestUrl,
    };
  } catch (error) {
    try {
      await CancellationScope.nonCancellable(() =>
        activities.updateIncidentStatus(input.incidentId, "failed"),
      );
    } catch {
      /* preserve original workflow failure */
    }
    return {
      incidentId: input.incidentId,
      repairRunId: input.repairRunId,
      status: "failed",
      reason: error instanceof Error ? error.message : "repair workflow failed",
    };
  } finally {
    if (sandboxCreated) {
      try {
        await CancellationScope.nonCancellable(() => activities.deleteSandbox(input.repairRunId));
      } catch {
        /* TTL remains as cleanup fallback */
      }
    }
  }
}
