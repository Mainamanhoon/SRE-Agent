export interface StartRepairCommand {
  incidentId: string;
  fingerprint: string;
  repairRunId: string;
  installationId: number;
  repository: string;
  deployedCommit: string;
  baseBranch: string;
  toolchain: "node" | "go";
  incident: Readonly<Record<string, unknown>>;
  evidence: readonly Readonly<Record<string, unknown>>[];
}
export interface RepairWorkflowHandle {
  workflowId: string;
  runId?: string;
  status: string;
}
export abstract class RepairWorkflowGateway {
  public abstract start(command: StartRepairCommand): Promise<RepairWorkflowHandle>;
  public abstract describe(repairRunId: string): Promise<RepairWorkflowHandle>;
}
