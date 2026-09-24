export interface RepairEvidence {
  id: string;
  kind: "exception" | "log" | "metric" | "source" | "trace";
  summary: string;
  uri?: string;
}

export interface RepairIncident {
  id: string;
  serviceName: string;
  environment: string;
  exceptionType: string;
  exceptionMessage: string;
  stackTrace?: string;
  deployedRevision?: string;
}

export interface RepairWorkflowInput {
  incidentId: string;
  fingerprint: string;
  repairRunId: string;
  installationId: number;
  repository: string;
  deployedCommit: string;
  baseBranch: string;
  toolchain: "node" | "go";
  incident: RepairIncident;
  evidence: RepairEvidence[];
}

export interface RepairChange {
  path: string;
  content?: string;
  delete?: boolean;
}
export interface RepairPlan {
  decision: "repair" | "abstain";
  summary: string;
  changes: RepairChange[];
}
export interface TriageResult {
  eligible: boolean;
  reason: string;
}
export interface DiagnosisResult {
  finalResponse: string;
  harness: string;
  model: string;
}
export interface SandboxState {
  status: "created" | "running" | "succeeded" | "failed";
  reason?: string;
}
export interface SandboxResult {
  status: "succeeded" | "failed";
  expectedCommit: string;
  changedPaths: string[];
  checks: Array<{ name: string; successful: boolean; output: string }>;
  reason?: string;
}
export interface DeliveryResult {
  branch: string;
  commitSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  draft: boolean;
}
export type RepairWorkflowStatus = "abstained" | "failed" | "pull_request_created";
export interface RepairWorkflowResult {
  incidentId: string;
  repairRunId: string;
  status: RepairWorkflowStatus;
  reason: string;
  pullRequestUrl?: string;
}
