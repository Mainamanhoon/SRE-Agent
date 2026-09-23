import type { DiagnoseIncidentRequest } from "../../domain/repair-agent.js";

export abstract class DiagnosisPromptBuilder {
  public abstract build(request: DiagnoseIncidentRequest): string;
}
