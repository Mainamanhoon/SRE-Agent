import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { RepairTool, type RepairToolContext } from "../src/application/contracts/repair-tool.js";
import {
  RepairToolAuditSink,
  RepairToolClock,
} from "../src/application/contracts/repair-tool-audit.js";
import { AllowlistedRepairToolAuthorizationPolicyV1 } from "../src/application/implementations/allowlisted-repair-tool-authorization-policy-v1.js";
import { InMemoryRepairToolCallBudgetV1 } from "../src/application/implementations/in-memory-repair-tool-call-budget-v1.js";
import { RepairToolCatalogV1 } from "../src/application/implementations/repair-tool-catalog-v1.js";
import { RepairToolExecutorV1 } from "../src/application/implementations/repair-tool-executor-v1.js";
import { McpStdioRepairToolServerV1 } from "../src/infrastructure/mcp/mcp-stdio-repair-tool-server-v1.js";

class EchoToolV1 extends RepairTool<{ value: string }, { value: string; runId: string }> {
  public readonly contexts: RepairToolContext[] = [];

  public override readonly descriptor = {
    name: "echoEvidence",
    version: "v1",
    description: "Return evidence for an MCP bridge test.",
    permission: "read" as const,
    inputSchema: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    },
  };

  public override validate(input: unknown): { value: string } {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof Reflect.get(input, "value") !== "string"
    ) {
      throw new Error("value is required");
    }
    return { value: Reflect.get(input, "value") as string };
  }

  public override async execute(context: RepairToolContext, input: { value: string }) {
    this.contexts.push(context);
    return { value: input.value, runId: context.repairRunId };
  }
}

class NoopAuditSink extends RepairToolAuditSink {
  public override async record(): Promise<void> {}
}

class FixedClock extends RepairToolClock {
  public override now(): number {
    return Date.parse("2026-09-23T00:00:00.000Z");
  }
}

const closeables: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(closeables.splice(0).map((closeable) => closeable.close()));
});

describe("McpStdioRepairToolServerV1", () => {
  it("discovers and executes project tools through the real MCP protocol", async () => {
    const tool = new EchoToolV1();
    const catalog = new RepairToolCatalogV1([tool]);
    const executor = new RepairToolExecutorV1(
      catalog,
      new AllowlistedRepairToolAuthorizationPolicyV1(["read"]),
      new InMemoryRepairToolCallBudgetV1(10),
      new NoopAuditSink(),
      new FixedClock(),
    );
    const adapter = new McpStdioRepairToolServerV1(catalog, executor, {
      serviceVersion: "test",
      context: { repairRunId: "trusted-run", workspacePath: "C:/trusted-workspace" },
      maxResultBytes: 10_000,
    });
    const server = adapter.createProtocolServer();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    closeables.push(client, server);

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    expect(listed.tools).toEqual([
      expect.objectContaining({
        name: "echoEvidence",
        annotations: expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
      }),
    ]);

    const result = await client.callTool({
      name: "echoEvidence",
      arguments: { value: "source evidence" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: '{"value":"source evidence","runId":"trusted-run"}' },
    ]);
    expect(tool.contexts).toEqual([
      expect.objectContaining({
        repairRunId: "trusted-run",
        workspacePath: "C:/trusted-workspace",
        signal: expect.any(AbortSignal),
      }),
    ]);
  });
});
