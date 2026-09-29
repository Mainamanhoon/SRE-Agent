import { z } from "zod";
import type {
  RepairRunEventPage,
  RepairRunListQuery,
  RepairRunPage,
  RepairRunRecord,
} from "../../application/contracts/repair-run-projection-gateway.js";
import { RepairRunProjectionGateway } from "../../application/contracts/repair-run-projection-gateway.js";
import type { StartRepairCommand } from "../../application/contracts/repair-workflow-gateway.js";

export interface RepairRunProjectionGatewaySettings {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  maxResponseBytes: number;
}

export class RepairRunProjectionRequestError extends Error {
  public constructor(public readonly statusCode: number) {
    super("repair-run service request failed");
    this.name = "RepairRunProjectionRequestError";
  }
}

const runSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  repositoryOwner: z.string(),
  repositoryName: z.string(),
  expectedCommit: z.string(),
  toolchain: z.enum(["node", "go"]),
  status: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  version: z.number().int(),
  diagnosisSummary: z.string().optional(),
  abstentionReason: z.string().optional(),
  failureCode: z.string().optional(),
  sandboxId: z.string().optional(),
  pullRequestUrl: z.string().optional(),
  pullRequestNumber: z.number().int().optional(),
  verificationSummary: z.string().optional(),
  harness: z.string().optional(),
  model: z.string().optional(),
  policyVersion: z.string().optional(),
});
const runPageSchema = z.object({ items: z.array(runSchema), nextCursor: z.string().optional() });
const eventPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      repairRunId: z.string(),
      eventType: z.string(),
      stage: z.string(),
      outcome: z.string(),
      status: z.string().optional(),
      occurredAt: z.string(),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
  nextCursor: z.number().int().optional(),
});

export class FetchRepairRunProjectionGatewayV1 extends RepairRunProjectionGateway {
  public constructor(private readonly settings: RepairRunProjectionGatewaySettings) {
    super();
  }

  public override async create(command: StartRepairCommand): Promise<RepairRunRecord> {
    const [repositoryOwner, repositoryName] = command.repository.split("/");
    const response = await this.request(
      "POST",
      new URL("/api/v1/repair-runs", this.settings.baseUrl),
      {
        id: command.repairRunId,
        incidentId: command.incidentId,
        repositoryOwner,
        repositoryName,
        expectedCommit: command.deployedCommit,
        toolchain: command.toolchain,
      },
    );
    return runSchema.parse(response);
  }

  public override async get(id: string, signal?: AbortSignal): Promise<RepairRunRecord> {
    return runSchema.parse(
      await this.request(
        "GET",
        new URL(`/api/v1/repair-runs/${encodeURIComponent(id)}`, this.settings.baseUrl),
        undefined,
        signal,
      ),
    );
  }

  public override async list(
    query: RepairRunListQuery,
    signal?: AbortSignal,
  ): Promise<RepairRunPage> {
    const url = new URL("/api/v1/repair-runs", this.settings.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    return runPageSchema.parse(await this.request("GET", url, undefined, signal));
  }

  public override async listEvents(
    id: string,
    afterId: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<RepairRunEventPage> {
    const url = new URL(
      `/api/v1/repair-runs/${encodeURIComponent(id)}/events`,
      this.settings.baseUrl,
    );
    url.searchParams.set("afterId", String(afterId));
    url.searchParams.set("limit", String(limit));
    return eventPageSchema.parse(await this.request("GET", url, undefined, signal));
  }

  private async request(
    method: string,
    url: URL,
    body?: unknown,
    parentSignal?: AbortSignal,
  ): Promise<unknown> {
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, AbortSignal.timeout(this.settings.timeoutMs)])
      : AbortSignal.timeout(this.settings.timeoutMs);
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.settings.serviceToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > this.settings.maxResponseBytes)
      throw new Error("repair-run response exceeded configured limit");
    const text = await response.text();
    if (Buffer.byteLength(text) > this.settings.maxResponseBytes)
      throw new Error("repair-run response exceeded configured limit");
    if (!response.ok) throw new RepairRunProjectionRequestError(response.status);
    return text ? JSON.parse(text) : null;
  }
}
