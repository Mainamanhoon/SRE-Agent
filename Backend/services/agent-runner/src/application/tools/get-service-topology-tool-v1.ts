import { z } from "zod";
import type { ServiceTopologyEvidenceSource } from "../contracts/evidence-sources.js";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";

const inputSchema = z.object({}).strict();

export type GetServiceTopologyInput = z.infer<typeof inputSchema>;

export class GetServiceTopologyToolV1 extends RepairTool<
  GetServiceTopologyInput,
  Awaited<ReturnType<ServiceTopologyEvidenceSource["getServiceTopology"]>>
> {
  public override readonly descriptor = {
    name: "getServiceTopology",
    version: "v1",
    description: "Get the control plane's configured service endpoints and capabilities.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly topology: ServiceTopologyEvidenceSource) {
    super();
  }

  public override validate(input: unknown): GetServiceTopologyInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, _input: GetServiceTopologyInput) {
    return this.topology.getServiceTopology(context.signal);
  }
}
