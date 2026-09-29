export interface SubmitCandidateCommand {
  service: string;
  environment: string;
  errorType: string;
  errorMessage: string;
  topFrame?: string;
  traceId?: string;
  severity?: string;
}

export interface StartDiagnosisCommand {
  repairRunId: string;
  incident: Readonly<Record<string, unknown>>;
  evidence: readonly Readonly<Record<string, unknown>>[];
}

export interface IncidentListQuery {
  status?: string;
  service?: string;
  limit?: number;
  cursor?: string;
}

export abstract class ControlPlaneGateway {
  public abstract submitCandidate(
    command: SubmitCandidateCommand,
    signal?: AbortSignal,
  ): Promise<unknown>;

  public abstract getIncident(incidentId: string, signal?: AbortSignal): Promise<unknown>;

  public abstract listIncidents(query: IncidentListQuery, signal?: AbortSignal): Promise<unknown>;

  public abstract listIncidentOccurrences(
    incidentId: string,
    limit: number,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<unknown>;

  public abstract getIncidentActions(incidentId: string, signal?: AbortSignal): Promise<unknown>;

  public abstract updateIncidentStatus(
    incidentId: string,
    status: string,
    signal?: AbortSignal,
  ): Promise<unknown>;

  public abstract startDiagnosis(
    command: StartDiagnosisCommand,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
