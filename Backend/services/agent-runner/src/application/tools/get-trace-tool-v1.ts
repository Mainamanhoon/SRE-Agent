import { z } from "zod";
import type { TraceEvidenceSource } from "../contracts/evidence-sources.js";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";

const inputSchema = z.object({
  traceId: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[a-fA-F0-9]+$/),
});

export type GetTraceInput = z.infer<typeof inputSchema>;

export class GetTraceToolV1 extends RepairTool<
  GetTraceInput,
  Awaited<ReturnType<TraceEvidenceSource["getTrace"]>>
> {
  public override readonly descriptor = {
    name: "getTrace",
    version: "v1",
    description: "Get a trace from the configured trace query backend.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly traces: TraceEvidenceSource) {
    super();
  }

  public override validate(input: unknown): GetTraceInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: GetTraceInput) {
    return this.traces.getTrace(input.traceId, context.signal);
  }
}
