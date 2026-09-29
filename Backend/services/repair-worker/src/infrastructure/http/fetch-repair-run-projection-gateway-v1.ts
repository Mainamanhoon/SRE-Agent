import type { RepairRunEventInput } from "../../application/contracts/repair-run-projection-gateway.js";
import { RepairRunProjectionGateway } from "../../application/contracts/repair-run-projection-gateway.js";
import type { RepairWorkflowInput } from "../../contracts.js";

export interface RepairRunProjectionSettings {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  maxResponseBytes: number;
}

export class FetchRepairRunProjectionGatewayV1 extends RepairRunProjectionGateway {
  public constructor(private readonly settings: RepairRunProjectionSettings) {
    super();
  }

  public override async create(input: RepairWorkflowInput): Promise<void> {
    const [repositoryOwner, repositoryName] = input.repository.split("/");
    await this.request("POST", new URL("/api/v1/repair-runs", this.settings.baseUrl), {
      id: input.repairRunId,
      incidentId: input.incidentId,
      repositoryOwner,
      repositoryName,
      expectedCommit: input.deployedCommit,
      toolchain: input.toolchain,
    });
  }

  public override async appendEvent(input: RepairRunEventInput): Promise<void> {
    await this.request(
      "POST",
      new URL(
        `/api/v1/repair-runs/${encodeURIComponent(input.repairRunId)}/events`,
        this.settings.baseUrl,
      ),
      {
        eventType: input.eventType,
        stage: input.stage,
        outcome: input.outcome,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
    );
  }

  private async request(method: string, url: URL, body: unknown): Promise<void> {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.settings.serviceToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.settings.timeoutMs),
    });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > this.settings.maxResponseBytes)
      throw new Error("repair-run response exceeded configured limit");
    const text = await response.text();
    if (Buffer.byteLength(text) > this.settings.maxResponseBytes)
      throw new Error("repair-run response exceeded configured limit");
    if (!response.ok) throw new Error(`repair-run service returned ${response.status}`);
    if (text) JSON.parse(text);
  }
}
