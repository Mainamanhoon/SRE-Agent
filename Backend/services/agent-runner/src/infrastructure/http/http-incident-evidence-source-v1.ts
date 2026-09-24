import { z } from "zod";
import {
  type IncidentEvidenceRecord,
  IncidentEvidenceSource,
} from "../../application/contracts/evidence-sources.js";
import type { JsonHttpClient } from "../../application/contracts/json-http-client.js";

const incidentSchema = z.object({
  id: z.string().uuid(),
  fingerprint: z.string(),
  service: z.string(),
  environment: z.string(),
  severity: z.string(),
  status: z.string(),
  occurrenceCount: z.number().int().nonnegative(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  traceId: z.string().optional(),
  errorSummary: z.string().optional(),
});

export interface HttpEvidenceSourceOptions {
  timeoutMs: number;
  maxResponseBytes: number;
  headers?: Readonly<Record<string, string>>;
}

export class HttpIncidentEvidenceSourceV1 extends IncidentEvidenceSource {
  public constructor(
    private readonly http: JsonHttpClient,
    private readonly baseUrl: URL,
    private readonly options: HttpEvidenceSourceOptions,
  ) {
    super();
  }

  public override async getIncident(
    incidentId: string,
    signal?: AbortSignal,
  ): Promise<IncidentEvidenceRecord> {
    const url = new URL(`/api/v1/incidents/${encodeURIComponent(incidentId)}`, this.baseUrl);
    const payload = await this.http.get({ url, signal, ...this.options });
    return incidentSchema.parse(payload);
  }
}
