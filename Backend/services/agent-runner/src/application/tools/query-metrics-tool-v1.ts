import { z } from "zod";
import type { MetricQuerySource } from "../contracts/observability-query-sources.js";
import { RepairTool, type RepairToolContext } from "../contracts/repair-tool.js";

const MAX_QUERY_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_SAMPLES_PER_SERIES = 10_000;

const inputSchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    stepSeconds: z.number().int().min(1).max(3_600).default(60),
  })
  .superRefine((input, context) => {
    const durationSeconds = (Date.parse(input.end) - Date.parse(input.start)) / 1_000;
    if (durationSeconds < 0) {
      context.addIssue({ code: "custom", path: ["end"], message: "end must not precede start" });
      return;
    }
    if (durationSeconds > MAX_QUERY_WINDOW_SECONDS) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "metric query window must not exceed 24 hours",
      });
    }
    if (Math.floor(durationSeconds / input.stepSeconds) + 1 > MAX_SAMPLES_PER_SERIES) {
      context.addIssue({
        code: "custom",
        path: ["stepSeconds"],
        message: "metric query must request at most 10000 samples per series",
      });
    }
  });

export type QueryMetricsInput = z.infer<typeof inputSchema>;

export class QueryMetricsToolV1 extends RepairTool<
  QueryMetricsInput,
  Awaited<ReturnType<MetricQuerySource["queryMetrics"]>>
> {
  public override readonly descriptor = {
    name: "queryMetrics",
    version: "v1",
    description:
      "Run a bounded PromQL range query against the configured Prometheus-compatible backend.",
    permission: "read" as const,
    inputSchema: z.toJSONSchema(inputSchema),
  };

  public constructor(private readonly metrics: MetricQuerySource) {
    super();
  }

  public override validate(input: unknown): QueryMetricsInput {
    return inputSchema.parse(input);
  }

  public override execute(context: RepairToolContext, input: QueryMetricsInput) {
    return this.metrics.queryMetrics(input, context.signal);
  }
}
