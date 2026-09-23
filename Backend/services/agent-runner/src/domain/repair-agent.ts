export type RepairEvidenceKind = "exception" | "log" | "metric" | "source" | "trace";

export interface RepairEvidence {
  id: string;
  kind: RepairEvidenceKind;
  summary: string;
  uri?: string;
}

export interface IncidentForDiagnosis {
  id: string;
  serviceName: string;
  environment: string;
  exceptionType: string;
  exceptionMessage: string;
  stackTrace?: string;
  deployedRevision?: string;
}

export interface DiagnoseIncidentRequest {
  repairRunId: string;
  incident: IncidentForDiagnosis;
  evidence: readonly RepairEvidence[];
}

export type RepairAgentEventKind =
  | "agent.activity"
  | "agent.message"
  | "agent.status"
  | "tool.activity";

export interface RepairAgentEvent {
  sequence: number;
  kind: RepairAgentEventKind;
  name: string;
  data: Readonly<Record<string, unknown>>;
}

export interface RepairAgentRunResult {
  runId: string;
  harness: string;
  harnessVersion: string;
  provider: string;
  model: string;
  sessionId: string;
  status: "completed";
  finalResponse: string;
  events: readonly RepairAgentEvent[];
}

export interface RepairAgentCapabilities {
  harness: string;
  harnessVersion: string;
  modes: readonly ["diagnosis"];
  streamingEvents: boolean;
  sessionResume: boolean;
  perRunCancellation: boolean;
  readOnlyWorkspace: boolean;
}

export type RepairAgentEventObserver = (event: RepairAgentEvent) => void;
