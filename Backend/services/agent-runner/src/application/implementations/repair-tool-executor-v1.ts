import type { RepairToolCatalog, RepairToolContext } from "../contracts/repair-tool.js";
import { RepairToolExecutor } from "../contracts/repair-tool.js";
import type { RepairToolAuditSink, RepairToolClock } from "../contracts/repair-tool-audit.js";
import type { RepairToolAuthorizationPolicy } from "../contracts/repair-tool-authorization.js";
import type { RepairToolCallBudget } from "../contracts/repair-tool-budget.js";

export class RepairToolExecutorV1 extends RepairToolExecutor {
  public constructor(
    private readonly tools: RepairToolCatalog,
    private readonly authorization: RepairToolAuthorizationPolicy,
    private readonly budget: RepairToolCallBudget,
    private readonly audit: RepairToolAuditSink,
    private readonly clock: RepairToolClock,
  ) {
    super();
  }

  public override async execute(
    toolName: string,
    context: RepairToolContext,
    input: unknown,
  ): Promise<unknown> {
    const startedAt = this.clock.now();
    const tool = this.tools.get<unknown, unknown>(toolName);
    try {
      if (!tool) {
        throw new Error(`Unknown repair tool "${toolName}"`);
      }
      this.authorization.assertAllowed(tool.descriptor, context);
      this.budget.consume(tool.descriptor, context);
      const result = await tool.execute(context, tool.validate(input));
      await this.audit.record({
        repairRunId: context.repairRunId,
        toolName: tool.descriptor.name,
        toolVersion: tool.descriptor.version,
        permission: tool.descriptor.permission,
        outcome: "succeeded",
        occurredAt: new Date(startedAt).toISOString(),
        durationMs: Math.max(0, this.clock.now() - startedAt),
      });
      return result;
    } catch (error) {
      await this.audit.record({
        repairRunId: context.repairRunId,
        toolName,
        toolVersion: tool?.descriptor.version ?? "unknown",
        permission: tool?.descriptor.permission ?? "unknown",
        outcome: "failed",
        occurredAt: new Date(startedAt).toISOString(),
        durationMs: Math.max(0, this.clock.now() - startedAt),
        errorCode: getErrorCode(error),
      });
      throw error;
    }
  }
}

function getErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Reflect.get(error, "code");
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}
