import type { RepairWorkflowInput } from "../../contracts.js";

export interface RepairRunEventInput {
  repairRunId: string;
  eventType: string;
  stage: string;
  outcome: string;
  status?: string;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | string[]>;
}

export abstract class RepairRunProjectionGateway {
  public abstract create(input: RepairWorkflowInput): Promise<void>;
  public abstract appendEvent(input: RepairRunEventInput): Promise<void>;
}
