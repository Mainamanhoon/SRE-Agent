import { z } from "zod";
import type { ServiceTopologyEvidence } from "../../application/contracts/evidence-sources.js";
import { ServiceTopologyEvidenceSource } from "../../application/contracts/evidence-sources.js";
import type { JsonHttpClient } from "../../application/contracts/json-http-client.js";

const topologySchema = z.object({
  name: z.string().min(1),
  stage: z.string().min(1),
  capabilities: z.array(z.string()),
  services: z.record(z.string(), z.string()),
});

export interface ControlApiServiceTopologyOptions {
  timeoutMs: number;
  maxResponseBytes: number;
  headers?: Readonly<Record<string, string>>;
}

export class ControlApiServiceTopologySourceV1 extends ServiceTopologyEvidenceSource {
  public constructor(
    private readonly http: JsonHttpClient,
    private readonly baseUrl: URL,
    private readonly options: ControlApiServiceTopologyOptions,
  ) {
    super();
  }

  public override async getServiceTopology(signal?: AbortSignal): Promise<ServiceTopologyEvidence> {
    const payload = await this.http.get({
      url: new URL("/api/v1/system", this.baseUrl),
      signal,
      ...this.options,
    });
    return topologySchema.parse(payload);
  }
}
