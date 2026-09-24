import {
  ControlPlaneGateway,
  type StartDiagnosisCommand,
  type SubmitCandidateCommand,
} from "../../application/contracts/control-plane-gateway.js";

export interface ControlPlaneGatewaySettings {
  incidentDetectorUrl: string;
  incidentServiceUrl: string;
  agentRunnerUrl: string;
  serviceToken: string;
  timeoutMs: number;
  maxResponseBytes: number;
}

export class DownstreamRequestError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DownstreamRequestError";
  }
}

export class FetchControlPlaneGatewayV1 extends ControlPlaneGateway {
  public constructor(private readonly settings: ControlPlaneGatewaySettings) {
    super();
  }

  public override submitCandidate(command: SubmitCandidateCommand, signal?: AbortSignal) {
    return this.request(
      "POST",
      new URL("/api/v1/candidates", this.settings.incidentDetectorUrl),
      command,
      signal,
    );
  }

  public override getIncident(incidentId: string, signal?: AbortSignal) {
    return this.request(
      "GET",
      new URL(
        `/api/v1/incidents/${encodeURIComponent(incidentId)}`,
        this.settings.incidentServiceUrl,
      ),
      undefined,
      signal,
    );
  }

  public override startDiagnosis(command: StartDiagnosisCommand, signal?: AbortSignal) {
    return this.request(
      "POST",
      new URL("/api/v1/diagnoses", this.settings.agentRunnerUrl),
      command,
      signal,
    );
  }

  private async request(method: "GET" | "POST", url: URL, body?: unknown, signal?: AbortSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("downstream timeout")),
      this.settings.timeoutMs,
    );
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(this.settings.serviceToken
            ? { authorization: `Bearer ${this.settings.serviceToken}` }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await readBoundedJson(response, this.settings.maxResponseBytes);
      if (!response.ok) {
        throw new DownstreamRequestError(
          response.status,
          `downstream ${url.origin} returned ${response.status}`,
        );
      }
      return payload;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new Error("downstream response exceeded configured limit");
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes)
    throw new Error("downstream response exceeded configured limit");
  return text ? JSON.parse(text) : null;
}
