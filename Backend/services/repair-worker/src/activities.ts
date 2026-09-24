import type { RepairActivities } from "./application/contracts/repair-activities.js";
import { JsonRepairPlanParserV1 } from "./application/implementations/json-repair-plan-parser-v1.js";
import { RepairActivitiesV1 } from "./application/implementations/repair-activities-v1.js";
import { RequiredEvidenceTriagePolicyV1 } from "./application/implementations/required-evidence-triage-policy-v1.js";
import type { WorkerConfig } from "./config.js";
import { FetchRepairServiceGatewayV1 } from "./infrastructure/http/fetch-repair-service-gateway-v1.js";

export function createActivities(config: WorkerConfig): RepairActivities {
  const application = new RepairActivitiesV1(
    new RequiredEvidenceTriagePolicyV1(),
    new FetchRepairServiceGatewayV1({
      incidentServiceUrl: config.INCIDENT_SERVICE_URL,
      agentRunnerUrl: config.AGENT_RUNNER_URL,
      sandboxControllerUrl: config.SANDBOX_CONTROLLER_URL,
      githubAppUrl: config.GITHUB_APP_URL,
      sandboxSourceBaseUrl: config.SANDBOX_SOURCE_BASE_URL,
      serviceToken: config.INTERNAL_SERVICE_TOKEN,
      timeoutMs: config.DOWNSTREAM_TIMEOUT_MS,
      maxResponseBytes: config.DOWNSTREAM_MAX_RESPONSE_BYTES,
    }),
    new JsonRepairPlanParserV1(),
  );
  return {
    triageIncident: application.triageIncident.bind(application),
    updateIncidentStatus: application.updateIncidentStatus.bind(application),
    diagnoseIncident: application.diagnoseIncident.bind(application),
    createRepairPlan: application.createRepairPlan.bind(application),
    createSandbox: application.createSandbox.bind(application),
    getSandbox: application.getSandbox.bind(application),
    getSandboxResult: application.getSandboxResult.bind(application),
    deleteSandbox: application.deleteSandbox.bind(application),
    deliverRepair: application.deliverRepair.bind(application),
  };
}
