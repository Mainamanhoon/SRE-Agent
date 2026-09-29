import { fileURLToPath } from "node:url";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { describe, expect, it } from "vitest";
import type { RepairActivities } from "../src/application/contracts/repair-activities.js";
import type { RepairWorkflowInput } from "../src/contracts.js";

const input: RepairWorkflowInput = {
  incidentId: "incident-temporal-integration",
  fingerprint: "fingerprint-temporal-integration",
  repairRunId: "run-temporal-integration",
  installationId: 42,
  repository: "example/service",
  deployedCommit: "abcdef1234567",
  baseBranch: "main",
  toolchain: "node",
  incident: {
    id: "incident-temporal-integration",
    serviceName: "service",
    environment: "production",
    exceptionType: "TypeError",
    exceptionMessage: "boom",
    deployedRevision: "abcdef1234567",
  },
  evidence: [{ id: "exception-1", kind: "exception", summary: "TypeError: boom" }],
};

const integrationTest = process.env.RUN_TEMPORAL_INTEGRATION === "true" ? it : it.skip;

describe("Temporal repair-run projection integration", () => {
  integrationTest(
    "projects one successful workflow as an ordered, idempotent event stream",
    async () => {
      const environment = await TestWorkflowEnvironment.createTimeSkipping();
      const events: string[] = [];
      const activities: RepairActivities = {
        async createRepairRun() {
          events.push("run_created");
        },
        async recordRepairRunEvent(event) {
          events.push(event.eventType);
        },
        async triageIncident() {
          return { eligible: true, reason: "eligible" };
        },
        async updateIncidentStatus() {},
        async diagnoseIncident() {
          return { finalResponse: "diagnosis", harness: "test-harness", model: "test-model" };
        },
        async createRepairPlan() {
          return { decision: "repair", summary: "guard missing input", changes: [] };
        },
        async evaluateDeliveryApproval() {
          return {
            allowed: true,
            reasonCode: "DRAFT_DELIVERY_ALLOWED",
            summary: "approved",
            policyVersion: "test-v1",
            riskScore: 0.1,
          };
        },
        async createSandbox() {
          return { status: "created" };
        },
        async getSandbox() {
          return { status: "succeeded" };
        },
        async getSandboxResult() {
          return {
            status: "succeeded",
            expectedCommit: input.deployedCommit,
            changedPaths: ["src/app.ts"],
            checks: [{ name: "unit-tests", successful: true, output: "passed" }],
          };
        },
        async deleteSandbox() {},
        async deliverRepair() {
          return {
            branch: "repair/run-temporal-integration",
            commitSha: "fedcba9876543",
            pullRequestNumber: 17,
            pullRequestUrl: "https://github.com/example/service/pull/17",
            draft: true,
          };
        },
      };

      try {
        const taskQueue = `repair-run-projection-${Date.now()}`;
        const worker = await Worker.create({
          connection: environment.nativeConnection,
          namespace: environment.namespace,
          taskQueue,
          workflowsPath: fileURLToPath(new URL("../src/workflows.ts", import.meta.url)),
          activities,
        });
        const workerRun = worker.run();
        const handle = await environment.client.workflow.start("repairWorkflow", {
          workflowId: "run-temporal-integration",
          taskQueue,
          args: [input],
        });
        const result = await handle.result();
        await worker.shutdown();
        await workerRun;

        expect(result).toMatchObject({
          repairRunId: input.repairRunId,
          status: "pull_request_created",
          pullRequestUrl: "https://github.com/example/service/pull/17",
        });
        expect(events).toEqual([
          "run_created",
          "triage_completed",
          "diagnosis_completed",
          "repair_plan_created",
          "sandbox_requested",
          "verification_started",
          "verification_passed",
          "delivery_started",
          "pull_request_created",
        ]);
      } finally {
        await environment.teardown();
      }
    },
    180_000,
  );
});
