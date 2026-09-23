import { describe, expect, it } from "vitest";
import {
  JsonHttpClient,
  type JsonHttpRequest,
} from "../src/application/contracts/json-http-client.js";
import {
  type LogQuery,
  LogQuerySource,
  MetricQuerySource,
  type MetricRangeQuery,
} from "../src/application/contracts/observability-query-sources.js";
import { QueryLogsToolV1 } from "../src/application/tools/query-logs-tool-v1.js";
import { QueryMetricsToolV1 } from "../src/application/tools/query-metrics-tool-v1.js";
import { LokiLogQuerySourceV1 } from "../src/infrastructure/http/loki-log-query-source-v1.js";
import { PrometheusMetricQuerySourceV1 } from "../src/infrastructure/http/prometheus-metric-query-source-v1.js";

class StubLogQuerySource extends LogQuerySource {
  public query?: LogQuery;

  public override async queryLogs(query: LogQuery) {
    this.query = query;
    return { streams: [{ labels: { service: "checkout" }, entries: [] }] };
  }
}

class StubMetricQuerySource extends MetricQuerySource {
  public query?: MetricRangeQuery;

  public override async queryMetrics(query: MetricRangeQuery) {
    this.query = query;
    return { series: [{ labels: { service: "checkout" }, samples: [] }] };
  }
}

class StubJsonHttpClient extends JsonHttpClient {
  public request?: JsonHttpRequest;

  public constructor(private readonly response: unknown) {
    super();
  }

  public override async get(request: JsonHttpRequest): Promise<unknown> {
    this.request = request;
    return this.response;
  }
}

const context = { repairRunId: "repair-1", workspacePath: "C:/workspace" };
const options = { timeoutMs: 1_000, maxResponseBytes: 100_000 };

describe("observability query tools", () => {
  it("validates and executes bounded log queries", async () => {
    const source = new StubLogQuerySource();
    const tool = new QueryLogsToolV1(source);
    const input = tool.validate({
      query: '{service="checkout"} |= "error"',
      start: "2026-09-23T00:00:00Z",
      end: "2026-09-23T01:00:00Z",
    });

    await expect(tool.execute(context, input)).resolves.toMatchObject({
      streams: [{ labels: { service: "checkout" } }],
    });
    expect(source.query).toMatchObject({ limit: 100, direction: "backward" });
    expect(() =>
      tool.validate({
        query: "{}",
        start: "2026-09-22T00:00:00Z",
        end: "2026-09-24T00:00:01Z",
      }),
    ).toThrow(/24 hours/);
  });

  it("validates and executes bounded metric range queries", async () => {
    const source = new StubMetricQuerySource();
    const tool = new QueryMetricsToolV1(source);
    const input = tool.validate({
      query: "rate(http_server_request_duration_seconds_count[5m])",
      start: "2026-09-23T00:00:00Z",
      end: "2026-09-23T01:00:00Z",
    });

    await expect(tool.execute(context, input)).resolves.toMatchObject({
      series: [{ labels: { service: "checkout" } }],
    });
    expect(source.query).toMatchObject({ stepSeconds: 60 });
    expect(() =>
      tool.validate({
        query: "up",
        start: "2026-09-23T00:00:00Z",
        end: "2026-09-22T00:00:00Z",
      }),
    ).toThrow(/precede/);
  });
});

describe("observability HTTP adapters", () => {
  it("maps Loki streams and encodes all range parameters", async () => {
    const http = new StubJsonHttpClient({
      status: "success",
      data: {
        resultType: "streams",
        result: [
          {
            stream: { service: "checkout" },
            values: [["1790121600000000000", "request failed"]],
          },
        ],
      },
    });
    const source = new LokiLogQuerySourceV1(http, new URL("http://loki:3100"), options);

    await expect(
      source.queryLogs({
        query: '{service="checkout"}',
        start: "2026-09-23T00:00:00Z",
        end: "2026-09-23T01:00:00Z",
        limit: 50,
        direction: "backward",
      }),
    ).resolves.toEqual({
      streams: [
        {
          labels: { service: "checkout" },
          entries: [{ timestamp: "1790121600000000000", message: "request failed" }],
        },
      ],
    });
    expect(http.request?.url.pathname).toBe("/loki/api/v1/query_range");
    expect(http.request?.url.searchParams.get("query")).toBe('{service="checkout"}');
    expect(http.request?.url.searchParams.get("limit")).toBe("50");
  });

  it("maps Prometheus matrices and encodes the range step", async () => {
    const http = new StubJsonHttpClient({
      status: "success",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { __name__: "up", service: "checkout" },
            values: [[1790121600, "1"]],
          },
        ],
      },
    });
    const source = new PrometheusMetricQuerySourceV1(
      http,
      new URL("http://prometheus:9090"),
      options,
    );

    await expect(
      source.queryMetrics({
        query: "up",
        start: "2026-09-23T00:00:00Z",
        end: "2026-09-23T01:00:00Z",
        stepSeconds: 30,
      }),
    ).resolves.toEqual({
      series: [
        {
          labels: { __name__: "up", service: "checkout" },
          samples: [{ timestamp: "1790121600", value: "1" }],
        },
      ],
    });
    expect(http.request?.url.pathname).toBe("/api/v1/query_range");
    expect(http.request?.url.searchParams.get("query")).toBe("up");
    expect(http.request?.url.searchParams.get("step")).toBe("30");
  });
});
