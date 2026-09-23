import type { RepairToolAuditEvent } from "../../application/contracts/repair-tool-audit.js";
import { RepairToolAuditSink } from "../../application/contracts/repair-tool-audit.js";

export type AuditLineWriter = (line: string) => void;

export class JsonLinesRepairToolAuditSinkV1 extends RepairToolAuditSink {
  public constructor(private readonly writeLine: AuditLineWriter) {
    super();
  }

  public override async record(event: RepairToolAuditEvent): Promise<void> {
    this.writeLine(`${JSON.stringify({ event: "repair_tool_invocation", ...event })}\n`);
  }
}
