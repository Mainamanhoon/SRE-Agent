import {
  ApplicationFailure,
  CancellationScope,
  patched,
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
  const projectionEnabled = patched("repair-run-projection-v1");
  let sandboxCreated = false;
  let incidentStarted = false;
  try {
    if (projectionEnabled) await activities.createRepairRun(input);
    const triage = await activities.triageIncident(input);
    if (!triage.eligible) {
      if (projectionEnabled) {
        await activities.recordRepairRunEvent({
          repairRunId: input.repairRunId,
          eventType: "repair_abstained",
          stage: "triage",
          outcome: "abstained",
          status: "abstained",
          idempotencyKey: "repair-abstained-v1",
          metadata: { reasonCode: "TRIAGE_INELIGIBLE", summary: triage.reason.slice(0, 2000) },
        });
      }
      return {
        incidentId: input.incidentId,
        repairRunId: input.repairRunId,
        status: "abstained",
        reason: triage.reason,
      };
    }

    await activities.updateIncidentStatus(input.incidentId, "investigating");
    incidentStarted = true;
    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "triage_completed",
        stage: "triage",
        outcome: "eligible",
        status: "investigating",
        idempotencyKey: "triage-completed-v1",
      });
    }
    const diagnosis = await longActivities.diagnoseIncident(input);
    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "diagnosis_completed",
        stage: "diagnosis",
        outcome: "succeeded",
        status: "diagnosing",
        idempotencyKey: "diagnosis-completed-v1",
        metadata: {
          harness: diagnosis.harness.slice(0, 2000),
          model: diagnosis.model.slice(0, 2000),
        },
      });
    }
    const plan = await activities.createRepairPlan(input, diagnosis);
    if (plan.decision === "abstain") {
      await activities.updateIncidentStatus(input.incidentId, "abstained");
      if (projectionEnabled) {
        await activities.recordRepairRunEvent({
          repairRunId: input.repairRunId,
          eventType: "repair_abstained",
          stage: "planning",
          outcome: "abstained",
          status: "abstained",
          idempotencyKey: "repair-abstained-v1",
          metadata: { reasonCode: "PLAN_ABSTAINED", summary: plan.summary.slice(0, 2000) },
        });
      }
      return {
        incidentId: input.incidentId,
        repairRunId: input.repairRunId,
        status: "abstained",
        reason: plan.summary,
      };
    }

    const approval = await activities.evaluateDeliveryApproval(input, plan);
    if (!approval.allowed) {
      if (projectionEnabled) {
        await activities.recordRepairRunEvent({
          repairRunId: input.repairRunId,
          eventType: "delivery_abstained",
          stage: "policy",
          outcome: "abstained",
          status: "abstained",
          idempotencyKey: "delivery-policy-abstained-v1",
          metadata: {
            reasonCode: approval.reasonCode,
            summary: approval.summary.slice(0, 2000),
            policyVersion: approval.policyVersion,
            riskScore: approval.riskScore,
          },
        });
      }
      return {
        incidentId: input.incidentId,
        repairRunId: input.repairRunId,
        status: "abstained",
        reason: approval.summary,
      };
    }

    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "repair_plan_created",
        stage: "planning",
        outcome: "accepted",
        status: "planning",
        idempotencyKey: "repair-plan-created-v1",
        metadata: {
          summary: plan.summary.slice(0, 2000),
          policyVersion: approval.policyVersion,
          riskScore: approval.riskScore,
        },
      });
    }
    await activities.updateIncidentStatus(input.incidentId, "repairing");
    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "sandbox_requested",
        stage: "sandbox",
        outcome: "started",
        status: "repairing",
        idempotencyKey: "sandbox-requested-v1",
      });
    }
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
    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "verification_started",
        stage: "verification",
        outcome: "started",
        status: "verifying",
        idempotencyKey: "verification-started-v1",
      });
    }
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
    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "verification_passed",
        stage: "verification",
        outcome: "succeeded",
        status: "verified",
        idempotencyKey: "verification-passed-v1",
        metadata: {
          changedPaths: verification.changedPaths.slice(0, 100),
          checkNames: verification.checks.map((check) => check.name.slice(0, 500)).slice(0, 100),
          verificationStatus: "passed",
        },
      });
    }
    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "delivery_started",
        stage: "delivery",
        outcome: "started",
        status: "delivering",
        idempotencyKey: "delivery-started-v1",
      });
    }
    const delivery = await activities.deliverRepair(input, plan, verification);
    await activities.updateIncidentStatus(input.incidentId, "awaiting_review");
    if (projectionEnabled) {
      await activities.recordRepairRunEvent({
        repairRunId: input.repairRunId,
        eventType: "pull_request_created",
        stage: "delivery",
        outcome: "succeeded",
        status: "awaiting_review",
        idempotencyKey: "pull-request-created-v1",
        metadata: {
          pullRequestUrl: delivery.pullRequestUrl,
          pullRequestNumber: delivery.pullRequestNumber,
        },
      });
    }
    return {
      incidentId: input.incidentId,
      repairRunId: input.repairRunId,
      status: "pull_request_created",
      reason: plan.summary,
      pullRequestUrl: delivery.pullRequestUrl,
    };
  } catch (error) {
    if (projectionEnabled) {
      try {
        await activities.recordRepairRunEvent({
          repairRunId: input.repairRunId,
          eventType: "repair_failed",
          stage: "workflow",
          outcome: "failed",
          status: "failed",
          idempotencyKey: "repair-failed-v1",
          metadata: { reasonCode: "WORKFLOW_FAILED" },
        });
      } catch {
        /* the projection reconciler can repair a missed terminal event */
      }
    }
    try {
      if (incidentStarted) {
        await CancellationScope.nonCancellable(() =>
          activities.updateIncidentStatus(input.incidentId, "failed"),
        );
      }
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
