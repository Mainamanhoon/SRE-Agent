import {
  JsonHttpClient,
  type JsonHttpRequest,
} from "../../application/contracts/json-http-client.js";

export class FetchJsonHttpClientV1 extends JsonHttpClient {
  public override async get(request: JsonHttpRequest): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("HTTP request timed out")),
      request.timeoutMs,
    );
    const abortFromCaller = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await fetch(request.url, {
        method: "GET",
        headers: { accept: "application/json", ...request.headers },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP GET ${request.url.origin} failed with status ${response.status}`);
      }
      return JSON.parse(await readBoundedBody(response, request.maxResponseBytes));
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    throw new Error("HTTP response contained no body");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      totalBytes += next.value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error(`HTTP response exceeded the ${maxBytes}-byte limit`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
