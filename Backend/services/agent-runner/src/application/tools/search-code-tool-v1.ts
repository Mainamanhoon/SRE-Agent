import { z } from "zod";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";
import type { CodeSearchSource } from "../contracts/workspace-sources.js";

const inputSchema = z.object({
  query: z.string().min(1).max(1_000),
  path: z.string().min(1).max(1_000).optional(),
  isRegex: z.boolean().default(false),
  caseSensitive: z.boolean().default(true),
  maxResults: z.number().int().positive().max(200).default(50),
});

export type SearchCodeInput = z.infer<typeof inputSchema>;

export class SearchCodeToolV1 extends RepairTool<
  SearchCodeInput,
  Awaited<ReturnType<CodeSearchSource["search"]>>
> {
  public override readonly descriptor = {
    name: "searchCode",
    version: "v1",
    description:
      "Search repository text with a fixed-string query or an explicit regular expression.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly code: CodeSearchSource) {
    super();
  }

  public override validate(input: unknown): SearchCodeInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: SearchCodeInput) {
    return this.code.search(input, context.signal);
  }
}
