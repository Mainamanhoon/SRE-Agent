export interface JsonHttpRequest {
  url: URL;
  timeoutMs: number;
  maxResponseBytes: number;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
}

export abstract class JsonHttpClient {
  public abstract get(request: JsonHttpRequest): Promise<unknown>;
}
