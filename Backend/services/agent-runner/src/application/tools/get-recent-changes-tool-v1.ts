import { z } from "zod";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";
import type { RecentChangesSource } from "../contracts/workspace-sources.js";

const inputSchema = z.object({
  path: z.string().min(1).max(1_000).optional(),
  maxCommits: z.number().int().positive().max(50).default(20),
});

export type GetRecentChangesInput = z.infer<typeof inputSchema>;

export class GetRecentChangesToolV1 extends RepairTool<
  GetRecentChangesInput,
  Awaited<ReturnType<RecentChangesSource["getRecentChanges"]>>
> {
  public override readonly descriptor = {
    name: "getRecentChanges",
    version: "v1",
    description: "Read bounded recent Git commit metadata for the repository or one existing path.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly changes: RecentChangesSource) {
    super();
  }

  public override validate(input: unknown): GetRecentChangesInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: GetRecentChangesInput) {
    return this.changes.getRecentChanges(input, context.signal);
  }
}
