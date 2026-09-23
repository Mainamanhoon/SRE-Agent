import { z } from "zod";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";
import type { WorkspaceFileSource } from "../contracts/workspace-sources.js";

const inputSchema = z
  .object({
    path: z.string().min(1).max(1_000),
    startLine: z.number().int().positive().default(1),
    endLine: z.number().int().positive(),
  })
  .refine((input) => input.endLine >= input.startLine, {
    message: "endLine must be greater than or equal to startLine",
  })
  .refine((input) => input.endLine - input.startLine < 500, {
    message: "a file range cannot exceed 500 lines",
  });

export type ReadFileRangeInput = z.infer<typeof inputSchema>;

export class ReadFileRangeToolV1 extends RepairTool<
  ReadFileRangeInput,
  Awaited<ReturnType<WorkspaceFileSource["readRange"]>>
> {
  public override readonly descriptor = {
    name: "readFileRange",
    version: "v1",
    description: "Read at most 500 lines from a repository-relative text file.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly files: WorkspaceFileSource) {
    super();
  }

  public override validate(input: unknown): ReadFileRangeInput {
    return inputSchema.parse(input);
  }

  public override execute(_context: RepairToolContext, input: ReadFileRangeInput) {
    return this.files.readRange(input.path, input.startLine, input.endLine);
  }
}
