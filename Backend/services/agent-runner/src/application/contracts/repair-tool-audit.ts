import type { RepairToolPermission } from "./repair-tool.js";

export type RepairToolAuditOutcome = "succeeded" | "failed";

export interface RepairToolAuditEvent {
  repairRunId: string;
  toolName: string;
  toolVersion: string;
  permission: RepairToolPermission | "unknown";
  outcome: RepairToolAuditOutcome;
  occurredAt: string;
  durationMs: number;
  errorCode?: string;
}

export abstract class RepairToolAuditSink {
  public abstract record(event: RepairToolAuditEvent): Promise<void>;
}

export abstract class RepairToolClock {
  public abstract now(): number;
}
