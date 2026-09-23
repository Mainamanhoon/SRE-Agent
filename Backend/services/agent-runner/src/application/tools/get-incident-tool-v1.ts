import { z } from "zod";
import type { IncidentEvidenceSource } from "../contracts/evidence-sources.js";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";

const inputSchema = z.object({
  incidentId: z.string().uuid(),
});

export type GetIncidentInput = z.infer<typeof inputSchema>;

export class GetIncidentToolV1 extends RepairTool<
  GetIncidentInput,
  Awaited<ReturnType<IncidentEvidenceSource["getIncident"]>>
> {
  public override readonly descriptor = {
    name: "getIncident",
    version: "v1",
    description: "Get one sanitized incident record by UUID.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly incidents: IncidentEvidenceSource) {
    super();
  }

  public override validate(input: unknown): GetIncidentInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: GetIncidentInput) {
    return this.incidents.getIncident(input.incidentId, context.signal);
  }
}
