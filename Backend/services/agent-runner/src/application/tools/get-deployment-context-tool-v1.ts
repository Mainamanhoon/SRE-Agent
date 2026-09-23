import { z } from "zod";
import type { DeploymentContextSource } from "../contracts/deployment-context-source.js";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";

const kubernetesName = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/);

const inputSchema = z.object({
  service: kubernetesName.describe(
    "Service name matched against the configured Kubernetes deployment label.",
  ),
  namespace: kubernetesName
    .optional()
    .describe("Allowed Kubernetes namespace. The configured default is used when omitted."),
});

export type GetDeploymentContextInput = z.infer<typeof inputSchema>;

export class GetDeploymentContextToolV1 extends RepairTool<
  GetDeploymentContextInput,
  Awaited<ReturnType<DeploymentContextSource["getDeploymentContext"]>>
> {
  public override readonly descriptor = {
    name: "getDeploymentContext",
    version: "v1",
    description:
      "Get bounded rollout, replica, image, and condition evidence for a deployed service.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly deployments: DeploymentContextSource) {
    super();
  }

  public override validate(input: unknown): GetDeploymentContextInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: GetDeploymentContextInput) {
    return this.deployments.getDeploymentContext(input, context.signal);
  }
}
