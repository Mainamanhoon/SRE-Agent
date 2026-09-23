import { z } from "zod";
import type { LogQuerySource } from "../contracts/observability-query-sources.js";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";

const MAX_QUERY_WINDOW_MS = 24 * 60 * 60 * 1_000;

const inputSchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    limit: z.number().int().min(1).max(500).default(100),
    direction: z.enum(["backward", "forward"]).default("backward"),
  })
  .superRefine((input, context) => {
    const duration = Date.parse(input.end) - Date.parse(input.start);
    if (duration < 0) {
      context.addIssue({ code: "custom", path: ["end"], message: "end must not precede start" });
    } else if (duration > MAX_QUERY_WINDOW_MS) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "log query window must not exceed 24 hours",
      });
    }
  });

export type QueryLogsInput = z.infer<typeof inputSchema>;

export class QueryLogsToolV1 extends RepairTool<
  QueryLogsInput,
  Awaited<ReturnType<LogQuerySource["queryLogs"]>>
> {
  public override readonly descriptor = {
    name: "queryLogs",
    version: "v1",
    description: "Run a bounded LogQL range query against the configured Loki-compatible backend.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly logs: LogQuerySource) {
    super();
  }

  public override validate(input: unknown): QueryLogsInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: QueryLogsInput) {
    return this.logs.queryLogs(input, context.signal);
  }
}
