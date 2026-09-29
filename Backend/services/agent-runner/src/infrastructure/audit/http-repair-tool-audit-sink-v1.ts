import { createHash } from "node:crypto";
import {
  type RepairToolAuditEvent,
  RepairToolAuditSink,
} from "../../application/contracts/repair-tool-audit.js";

export interface DurableRepairToolAuditSettings {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
}

/**
 * Persists metadata-only tool invocations through the repair-run projection.
 * The projection already has transactional, idempotent events and therefore
 * provides a durable audit boundary without coupling the agent to PostgreSQL.
 */
export class HttpRepairToolAuditSinkV1 extends RepairToolAuditSink {
  public constructor(private readonly settings: DurableRepairToolAuditSettings) {
    super();
  }

  public async record(event: RepairToolAuditEvent): Promise<void> {
    const metadata: Record<string, string | number> = {
      toolName: event.toolName.slice(0, 500),
      toolVersion: event.toolVersion.slice(0, 200),
      permission: event.permission,
      durationMs: Math.max(0, Math.round(event.durationMs)),
      auditOccurredAt: event.occurredAt,
    };
    if (event.errorCode) metadata.errorCode = event.errorCode.slice(0, 200);
    const idempotencyKey = `tool-audit:${createHash("sha256")
      .update(JSON.stringify({ event, metadata }))
      .digest("hex")}`;
    const response = await fetch(
      new URL(
        `/api/v1/repair-runs/${encodeURIComponent(event.repairRunId)}/events`,
        this.settings.baseUrl,
      ),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${this.settings.serviceToken}`,
        },
        body: JSON.stringify({
          eventType: "tool_invocation",
          stage: "diagnosis",
          outcome: event.outcome,
          idempotencyKey,
          metadata,
        }),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      },
    );
    if (!response.ok) throw new Error(`repair-run audit returned HTTP ${response.status}`);
    await response.body?.cancel();
  }
}
