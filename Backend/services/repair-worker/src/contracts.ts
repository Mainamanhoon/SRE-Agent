export interface RepairWorkflowInput {
  incidentId: string;
  fingerprint: string;
  repository: string;
  deployedCommit: string;
}

export interface RepairWorkflowResult {
  incidentId: string;
  status: "awaiting_evidence" | "abstained";
  reason: string;
}

export interface TriageResult {
  eligible: boolean;
  reason: string;
}
