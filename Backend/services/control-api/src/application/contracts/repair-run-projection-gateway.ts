import type { StartRepairCommand } from "./repair-workflow-gateway.js";

export interface RepairRunRecord {
  id: string;
  incidentId: string;
  repositoryOwner: string;
  repositoryName: string;
  expectedCommit: string;
  toolchain: "node" | "go";
  status: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  version: number;
  diagnosisSummary?: string;
  abstentionReason?: string;
  failureCode?: string;
  sandboxId?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  verificationSummary?: string;
  harness?: string;
  model?: string;
  policyVersion?: string;
}

export interface RepairRunEvent {
  id: number;
  repairRunId: string;
  eventType: string;
  stage: string;
  outcome: string;
  status?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface RepairRunListQuery {
  incidentId?: string;
  status?: string;
  repository?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface RepairRunPage {
  items: RepairRunRecord[];
  nextCursor?: string;
}

export interface RepairRunEventPage {
  items: RepairRunEvent[];
  nextCursor?: number;
}

export abstract class RepairRunProjectionGateway {
  public abstract create(command: StartRepairCommand): Promise<RepairRunRecord>;
  public abstract get(id: string, signal?: AbortSignal): Promise<RepairRunRecord>;
  public abstract list(query: RepairRunListQuery, signal?: AbortSignal): Promise<RepairRunPage>;
  public abstract listEvents(
    id: string,
    afterId: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<RepairRunEventPage>;
}
