import { z } from "zod";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";
import type { TestFileSource } from "../contracts/workspace-sources.js";

const inputSchema = z
  .object({
    sourcePath: z.string().min(1).max(1_000).optional(),
    symbol: z.string().min(1).max(500).optional(),
    maxResults: z.number().int().positive().max(100).default(20),
  })
  .refine((input) => input.sourcePath !== undefined || input.symbol !== undefined, {
    message: "sourcePath or symbol is required",
  });

export type FindTestsInput = z.infer<typeof inputSchema>;

export class FindTestsToolV1 extends RepairTool<
  FindTestsInput,
  Awaited<ReturnType<TestFileSource["findTests"]>>
> {
  public override readonly descriptor = {
    name: "findTests",
    version: "v1",
    description: "Find and rank repository test files related to a source path or symbol.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly tests: TestFileSource) {
    super();
  }

  public override validate(input: unknown): FindTestsInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: FindTestsInput) {
    return this.tests.findTests(input, context.signal);
  }
}
