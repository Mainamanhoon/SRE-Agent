import {
  type TraceEvidenceRecord,
  TraceEvidenceSource,
} from "../../application/contracts/evidence-sources.js";
import type { JsonHttpClient } from "../../application/contracts/json-http-client.js";
import type { HttpEvidenceSourceOptions } from "./http-incident-evidence-source-v1.js";

export class JaegerTraceEvidenceSourceV1 extends TraceEvidenceSource {
  public constructor(
    private readonly http: JsonHttpClient,
    private readonly baseUrl: URL,
    private readonly options: HttpEvidenceSourceOptions,
  ) {
    super();
  }

  public override async getTrace(
    traceId: string,
    signal?: AbortSignal,
  ): Promise<TraceEvidenceRecord> {
    const url = new URL(`/api/traces/${encodeURIComponent(traceId)}`, this.baseUrl);
    return {
      traceId,
      payload: await this.http.get({ url, signal, ...this.options }),
    };
  }
}
