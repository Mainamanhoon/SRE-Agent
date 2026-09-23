export interface LogQuery {
  query: string;
  start: string;
  end: string;
  limit: number;
  direction: "backward" | "forward";
}

export interface LogEntry {
  timestamp: string;
  message: string;
}

export interface LogStream {
  labels: Readonly<Record<string, string>>;
  entries: readonly LogEntry[];
}

export interface LogQueryResult {
  streams: readonly LogStream[];
}

export abstract class LogQuerySource {
  public abstract queryLogs(query: LogQuery, signal?: AbortSignal): Promise<LogQueryResult>;
}

export interface MetricRangeQuery {
  query: string;
  start: string;
  end: string;
  stepSeconds: number;
}

export interface MetricSample {
  timestamp: string;
  value: string;
}

export interface MetricSeries {
  labels: Readonly<Record<string, string>>;
  samples: readonly MetricSample[];
}

export interface MetricQueryResult {
  series: readonly MetricSeries[];
}

export abstract class MetricQuerySource {
  public abstract queryMetrics(
    query: MetricRangeQuery,
    signal?: AbortSignal,
  ): Promise<MetricQueryResult>;
}
