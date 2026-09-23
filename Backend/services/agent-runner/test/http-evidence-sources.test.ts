import { describe, expect, it } from "vitest";
import {
  JsonHttpClient,
  type JsonHttpRequest,
} from "../src/application/contracts/json-http-client.js";
import { ControlApiServiceTopologySourceV1 } from "../src/infrastructure/http/control-api-service-topology-source-v1.js";
import { HttpIncidentEvidenceSourceV1 } from "../src/infrastructure/http/http-incident-evidence-source-v1.js";
import { JaegerTraceEvidenceSourceV1 } from "../src/infrastructure/http/jaeger-trace-evidence-source-v1.js";

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

const options = { timeoutMs: 1_000, maxResponseBytes: 100_000 };

describe("HTTP evidence sources", () => {
  it("maps the control API system view into stable topology evidence", async () => {
    const http = new StubJsonHttpClient({
      name: "Autonomous Self-Healing SRE Agent",
      stage: "foundation",
      capabilities: ["incident-correlation"],
      services: {
        incidentDetector: "http://incident-detector:4010",
        incidentService: "http://incident-service:4020",
        temporal: "temporal:7233",
      },
    });
    const source = new ControlApiServiceTopologySourceV1(
      http,
      new URL("http://control-api:4000"),
      options,
    );

    await expect(source.getServiceTopology()).resolves.toMatchObject({
      stage: "foundation",
      services: { temporal: "temporal:7233" },
    });
    expect(http.request?.url.toString()).toBe("http://control-api:4000/api/v1/system");
  });

  it("maps the incident API response into the stable evidence contract", async () => {
    const http = new StubJsonHttpClient({
      id: "8cb1bb40-215d-4b22-92b2-b080ddbd3166",
      fingerprint: "fingerprint",
      service: "checkout",
      environment: "production",
      severity: "error",
      status: "open",
      occurrenceCount: 3,
      firstSeenAt: "2026-09-23T00:00:00Z",
      lastSeenAt: "2026-09-23T00:01:00Z",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    });
    const source = new HttpIncidentEvidenceSourceV1(
      http,
      new URL("http://incident-service:4020"),
      options,
    );

    await expect(source.getIncident("8cb1bb40-215d-4b22-92b2-b080ddbd3166")).resolves.toMatchObject(
      {
        service: "checkout",
        occurrenceCount: 3,
      },
    );
    expect(http.request?.url.toString()).toBe(
      "http://incident-service:4020/api/v1/incidents/8cb1bb40-215d-4b22-92b2-b080ddbd3166",
    );
  });

  it("preserves a bounded Jaeger response as trace evidence", async () => {
    const payload = { data: [{ traceID: "4bf92f3577b34da6a3ce929d0e0e4736" }] };
    const http = new StubJsonHttpClient(payload);
    const source = new JaegerTraceEvidenceSourceV1(http, new URL("http://jaeger:16686"), options);

    await expect(source.getTrace("4bf92f3577b34da6a3ce929d0e0e4736")).resolves.toEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      payload,
    });
    expect(http.request?.url.toString()).toBe(
      "http://jaeger:16686/api/traces/4bf92f3577b34da6a3ce929d0e0e4736",
    );
  });
});
