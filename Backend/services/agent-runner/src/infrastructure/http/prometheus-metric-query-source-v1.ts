import { z } from "zod";
import type { JsonHttpClient } from "../../application/contracts/json-http-client.js";
import {
  type MetricQueryResult,
  MetricQuerySource,
  type MetricRangeQuery,
} from "../../application/contracts/observability-query-sources.js";
import type { HttpEvidenceSourceOptions } from "./http-incident-evidence-source-v1.js";

const prometheusResponseSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.literal("matrix"),
    result: z.array(
      z.object({
        metric: z.record(z.string(), z.string()),
        values: z.array(z.tuple([z.union([z.number(), z.string()]), z.string()])),
      }),
    ),
  }),
});

export class PrometheusMetricQuerySourceV1 extends MetricQuerySource {
  public constructor(
    private readonly http: JsonHttpClient,
    private readonly baseUrl: URL,
    private readonly options: HttpEvidenceSourceOptions,
  ) {
    super();
  }

  public override async queryMetrics(
    query: MetricRangeQuery,
    signal?: AbortSignal,
  ): Promise<MetricQueryResult> {
    const url = new URL("/api/v1/query_range", this.baseUrl);
    url.searchParams.set("query", query.query);
    url.searchParams.set("start", query.start);
    url.searchParams.set("end", query.end);
    url.searchParams.set("step", String(query.stepSeconds));

    const payload = prometheusResponseSchema.parse(
      await this.http.get({ url, signal, ...this.options }),
    );
    return {
      series: payload.data.result.map((series) => ({
        labels: series.metric,
        samples: series.values.map(([timestamp, value]) => ({
          timestamp: String(timestamp),
          value,
        })),
      })),
    };
  }
}
