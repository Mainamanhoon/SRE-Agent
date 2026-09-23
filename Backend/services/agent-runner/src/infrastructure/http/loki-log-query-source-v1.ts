import { z } from "zod";
import type { JsonHttpClient } from "../../application/contracts/json-http-client.js";
import {
  type LogQuery,
  type LogQueryResult,
  LogQuerySource,
} from "../../application/contracts/observability-query-sources.js";
import type { HttpEvidenceSourceOptions } from "./http-incident-evidence-source-v1.js";

const lokiResponseSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.literal("streams"),
    result: z.array(
      z.object({
        stream: z.record(z.string(), z.string()),
        values: z.array(z.tuple([z.string(), z.string()])),
      }),
    ),
  }),
});

export class LokiLogQuerySourceV1 extends LogQuerySource {
  public constructor(
    private readonly http: JsonHttpClient,
    private readonly baseUrl: URL,
    private readonly options: HttpEvidenceSourceOptions,
  ) {
    super();
  }

  public override async queryLogs(query: LogQuery, signal?: AbortSignal): Promise<LogQueryResult> {
    const url = new URL("/loki/api/v1/query_range", this.baseUrl);
    url.searchParams.set("query", query.query);
    url.searchParams.set("start", toNanoseconds(query.start));
    url.searchParams.set("end", toNanoseconds(query.end));
    url.searchParams.set("limit", String(query.limit));
    url.searchParams.set("direction", query.direction);

    const payload = lokiResponseSchema.parse(await this.http.get({ url, signal, ...this.options }));
    return {
      streams: payload.data.result.map((stream) => ({
        labels: stream.stream,
        entries: stream.values.map(([timestamp, message]) => ({ timestamp, message })),
      })),
    };
  }
}

function toNanoseconds(timestamp: string): string {
  return (BigInt(Date.parse(timestamp)) * 1_000_000n).toString();
}
