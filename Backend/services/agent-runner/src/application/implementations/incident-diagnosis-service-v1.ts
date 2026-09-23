import type {
  DiagnoseIncidentRequest,
  RepairAgentCapabilities,
  RepairAgentEventObserver,
  RepairAgentRunResult,
} from "../../domain/repair-agent.js";
import { IncidentDiagnosisService } from "../contracts/incident-diagnosis-service.js";
import type { RepairAgentHarness } from "../contracts/repair-agent-harness.js";

export class IncidentDiagnosisServiceV1 extends IncidentDiagnosisService {
  public constructor(private readonly harness: RepairAgentHarness) {
    super();
  }

  public override diagnose(
    request: DiagnoseIncidentRequest,
    observer?: RepairAgentEventObserver,
  ): Promise<RepairAgentRunResult> {
    return this.harness.diagnose(request, observer);
  }

  public override getCapabilities(): RepairAgentCapabilities {
    return this.harness.getCapabilities();
  }
}
