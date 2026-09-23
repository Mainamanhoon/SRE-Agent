import { describe, expect, it } from "vitest";
import { RepairTool, type RepairToolContext } from "../src/application/contracts/repair-tool.js";
import {
  type RepairToolAuditEvent,
  RepairToolAuditSink,
  RepairToolClock,
} from "../src/application/contracts/repair-tool-audit.js";
import { AllowlistedRepairToolAuthorizationPolicyV1 } from "../src/application/implementations/allowlisted-repair-tool-authorization-policy-v1.js";
import { InMemoryRepairToolCallBudgetV1 } from "../src/application/implementations/in-memory-repair-tool-call-budget-v1.js";
import { RepairToolCatalogV1 } from "../src/application/implementations/repair-tool-catalog-v1.js";
import { RepairToolExecutorV1 } from "../src/application/implementations/repair-tool-executor-v1.js";

class GetIncidentToolV1 extends RepairTool<{ incidentId: string }, { found: boolean }> {
  public override readonly descriptor = {
    name: "getIncident",
    version: "v1",
    description: "Get sanitized incident metadata.",
    permission: "read" as const,
    inputSchema: { type: "object" },
  };

  public override validate(input: unknown): { incidentId: string } {
    return input as { incidentId: string };
  }

  public override async execute(
    _context: RepairToolContext,
    input: { incidentId: string },
  ): Promise<{ found: boolean }> {
    return { found: input.incidentId.length > 0 };
  }
}

class MemoryAuditSink extends RepairToolAuditSink {
  public readonly events: RepairToolAuditEvent[] = [];

  public override async record(event: RepairToolAuditEvent): Promise<void> {
    this.events.push(event);
  }
}

class IncrementingClock extends RepairToolClock {
  private time = Date.parse("2026-09-23T00:00:00.000Z");

  public override now(): number {
    this.time += 5;
    return this.time;
  }
}

describe("RepairToolCatalogV1", () => {
  it("resolves application-owned tools by their stable contract name", async () => {
    const catalog = new RepairToolCatalogV1([new GetIncidentToolV1()]);
    const tool = catalog.get<{ incidentId: string }, { found: boolean }>("getIncident");

    expect(catalog.list()).toEqual([
      expect.objectContaining({ name: "getIncident", permission: "read" }),
    ]);
    await expect(
      tool?.execute({ repairRunId: "run-1", workspacePath: "C:/workspace" }, { incidentId: "1" }),
    ).resolves.toEqual({ found: true });
  });

  it("validates every invocation through the common executor", async () => {
    const audit = new MemoryAuditSink();
    const executor = new RepairToolExecutorV1(
      new RepairToolCatalogV1([new GetIncidentToolV1()]),
      new AllowlistedRepairToolAuthorizationPolicyV1(["read"]),
      new InMemoryRepairToolCallBudgetV1(10),
      audit,
      new IncrementingClock(),
    );

    await expect(
      executor.execute(
        "getIncident",
        { repairRunId: "run-1", workspacePath: "C:/workspace" },
        { incidentId: "incident-1" },
      ),
    ).resolves.toEqual({ found: true });
    await expect(
      executor.execute("unknown", { repairRunId: "run-1", workspacePath: "C:/workspace" }, {}),
    ).rejects.toThrow(/Unknown repair tool/);
    expect(audit.events).toEqual([
      expect.objectContaining({ toolName: "getIncident", outcome: "succeeded" }),
      expect.objectContaining({ toolName: "unknown", outcome: "failed" }),
    ]);
  });

  it("denies permissions outside the executor allowlist and audits the refusal", async () => {
    const writeTool = new GetIncidentToolV1();
    Object.defineProperty(writeTool, "descriptor", {
      value: { ...writeTool.descriptor, name: "writeIncident", permission: "external-write" },
    });
    const audit = new MemoryAuditSink();
    const executor = new RepairToolExecutorV1(
      new RepairToolCatalogV1([writeTool]),
      new AllowlistedRepairToolAuthorizationPolicyV1(["read"]),
      new InMemoryRepairToolCallBudgetV1(10),
      audit,
      new IncrementingClock(),
    );

    await expect(
      executor.execute(
        "writeIncident",
        { repairRunId: "run-1", workspacePath: "C:/workspace" },
        { incidentId: "incident-1" },
      ),
    ).rejects.toMatchObject({ code: "REPAIR_TOOL_PERMISSION_DENIED" });
    expect(audit.events).toEqual([
      expect.objectContaining({
        toolName: "writeIncident",
        permission: "external-write",
        outcome: "failed",
        errorCode: "REPAIR_TOOL_PERMISSION_DENIED",
      }),
    ]);
  });

  it("enforces a per-run tool-call budget through the common executor", async () => {
    const audit = new MemoryAuditSink();
    const executor = new RepairToolExecutorV1(
      new RepairToolCatalogV1([new GetIncidentToolV1()]),
      new AllowlistedRepairToolAuthorizationPolicyV1(["read"]),
      new InMemoryRepairToolCallBudgetV1(1),
      audit,
      new IncrementingClock(),
    );
    const context = { repairRunId: "budgeted-run", workspacePath: "C:/workspace" };

    await expect(
      executor.execute("getIncident", context, { incidentId: "incident-1" }),
    ).resolves.toEqual({ found: true });
    await expect(
      executor.execute("getIncident", context, { incidentId: "incident-1" }),
    ).rejects.toMatchObject({ code: "REPAIR_TOOL_BUDGET_EXCEEDED" });
    expect(audit.events.at(-1)).toMatchObject({
      outcome: "failed",
      errorCode: "REPAIR_TOOL_BUDGET_EXCEEDED",
    });
  });
});
