import { z } from "zod";
import { RepairServiceGateway } from "../../application/contracts/repair-service-gateway.js";
import type {
  DeliveryResult,
  DiagnosisResult,
  RepairPlan,
  RepairWorkflowInput,
  SandboxResult,
  SandboxState,
} from "../../contracts.js";

export interface RepairGatewaySettings {
  incidentServiceUrl: string;
  agentRunnerUrl: string;
  sandboxControllerUrl: string;
  githubAppUrl: string;
  sandboxSourceBaseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  maxResponseBytes: number;
}

const diagnosisSchema = z.object({
  finalResponse: z.string(),
  harness: z.string(),
  model: z.string(),
});
const sandboxStateSchema = z.object({
  status: z.enum(["created", "running", "succeeded", "failed"]),
  reason: z.string().optional(),
});
const sandboxResultSchema = z.object({
  status: z.enum(["succeeded", "failed"]),
  expectedCommit: z.string(),
  changedPaths: z.array(z.string()),
  checks: z.array(z.object({ name: z.string(), successful: z.boolean(), output: z.string() })),
  reason: z.string().optional(),
});
const deliverySchema = z.object({
  branch: z.string(),
  commitSha: z.string(),
  pullRequestNumber: z.number(),
  pullRequestUrl: z.string().url(),
  draft: z.boolean(),
});

export class DownstreamRequestError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DownstreamRequestError";
  }
}

export class FetchRepairServiceGatewayV1 extends RepairServiceGateway {
  public constructor(private readonly settings: RepairGatewaySettings) {
    super();
  }

  public override async updateIncidentStatus(incidentId: string, status: string): Promise<void> {
    await this.request(
      "PATCH",
      new URL(
        `/api/v1/incidents/${encodeURIComponent(incidentId)}/status`,
        this.settings.incidentServiceUrl,
      ),
      { status },
    );
  }
  public override async diagnoseIncident(input: RepairWorkflowInput): Promise<DiagnosisResult> {
    const value = await this.request(
      "POST",
      new URL("/api/v1/diagnoses", this.settings.agentRunnerUrl),
      { repairRunId: input.repairRunId, incident: input.incident, evidence: input.evidence },
    );
    return diagnosisSchema.parse(value);
  }
  public override async createSandbox(
    input: RepairWorkflowInput,
    plan: RepairPlan,
  ): Promise<SandboxState> {
    const archive = new URL("/api/v1/source-archives", this.settings.sandboxSourceBaseUrl);
    archive.searchParams.set("installationId", String(input.installationId));
    archive.searchParams.set("repository", input.repository);
    archive.searchParams.set("ref", input.deployedCommit);
    const value = await this.request(
      "POST",
      new URL("/api/v1/sandboxes", this.settings.sandboxControllerUrl),
      {
        repairRunId: input.repairRunId,
        toolchain: input.toolchain,
        sourceArchiveUrl: archive.toString(),
        expectedCommit: input.deployedCommit,
        changes: plan.changes,
        verificationProfile: input.toolchain,
      },
    );
    return sandboxStateSchema.parse(value);
  }
  public override async getSandbox(repairRunId: string): Promise<SandboxState> {
    return sandboxStateSchema.parse(
      await this.request(
        "GET",
        new URL(
          `/api/v1/sandboxes/${encodeURIComponent(repairRunId)}`,
          this.settings.sandboxControllerUrl,
        ),
      ),
    );
  }
  public override async getSandboxResult(repairRunId: string): Promise<SandboxResult> {
    return sandboxResultSchema.parse(
      await this.request(
        "GET",
        new URL(
          `/api/v1/sandboxes/${encodeURIComponent(repairRunId)}/result`,
          this.settings.sandboxControllerUrl,
        ),
      ),
    );
  }
  public override async deleteSandbox(repairRunId: string): Promise<void> {
    await this.request(
      "DELETE",
      new URL(
        `/api/v1/sandboxes/${encodeURIComponent(repairRunId)}`,
        this.settings.sandboxControllerUrl,
      ),
    );
  }
  public override async deliverRepair(
    input: RepairWorkflowInput,
    plan: RepairPlan,
    result: SandboxResult,
  ): Promise<DeliveryResult> {
    const checks = result.checks
      .map((check) => `- ${check.successful ? "PASS" : "FAIL"}: ${check.name}`)
      .join("\n");
    const value = await this.request(
      "POST",
      new URL("/api/v1/deliveries", this.settings.githubAppUrl),
      {
        repairRunId: input.repairRunId,
        installationId: input.installationId,
        repository: input.repository,
        baseCommit: input.deployedCommit,
        baseBranch: input.baseBranch,
        title: `SRE repair: ${input.incident.exceptionType}`,
        body: `${plan.summary}\n\nVerification:\n${checks}`,
        changes: plan.changes,
      },
    );
    return deliverySchema.parse(value);
  }

  private async request(method: string, url: URL, body?: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        authorization: `Bearer ${this.settings.serviceToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.settings.timeoutMs),
    });
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > this.settings.maxResponseBytes)
      throw new Error("downstream response exceeded configured limit");
    const text = await response.text();
    if (Buffer.byteLength(text) > this.settings.maxResponseBytes)
      throw new Error("downstream response exceeded configured limit");
    if (!response.ok)
      throw new DownstreamRequestError(
        response.status,
        `downstream ${url.origin} returned ${response.status}`,
      );
    return text ? JSON.parse(text) : null;
  }
}
