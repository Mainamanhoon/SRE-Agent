export interface IncidentEvidenceRecord {
  id: string;
  fingerprint: string;
  service: string;
  environment: string;
  severity: string;
  status: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  traceId?: string;
  errorSummary?: string;
}

export abstract class IncidentEvidenceSource {
  public abstract getIncident(
    incidentId: string,
    signal?: AbortSignal,
  ): Promise<IncidentEvidenceRecord>;
}

export interface TraceEvidenceRecord {
  traceId: string;
  payload: unknown;
}

export abstract class TraceEvidenceSource {
  public abstract getTrace(traceId: string, signal?: AbortSignal): Promise<TraceEvidenceRecord>;
}

export interface ServiceTopologyEvidence {
  name: string;
  stage: string;
  capabilities: readonly string[];
  services: Readonly<Record<string, string>>;
}

export abstract class ServiceTopologyEvidenceSource {
  public abstract getServiceTopology(signal?: AbortSignal): Promise<ServiceTopologyEvidence>;
}
