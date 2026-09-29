import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { HttpRepairToolAuditSinkV1 } from "../src/infrastructure/audit/http-repair-tool-audit-sink-v1.js";

describe("durable repair-tool audit sink", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            if (!server.listening) return resolve();
            server.close(() => resolve());
          }),
      ),
    );
  });

  it("writes bounded metadata through the idempotent repair-run event API", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        response.statusCode = 202;
        response.end("{}");
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    await new HttpRepairToolAuditSinkV1({
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceToken: "internal-token",
      timeoutMs: 1_000,
    }).record({
      repairRunId: "run-1",
      toolName: "readFileRange",
      toolVersion: "v1",
      permission: "read",
      outcome: "succeeded",
      occurredAt: "2026-09-30T00:00:00.000Z",
      durationMs: 14.6,
    });

    expect(requestBody).toMatchObject({
      eventType: "tool_invocation",
      stage: "diagnosis",
      outcome: "succeeded",
      metadata: {
        toolName: "readFileRange",
        toolVersion: "v1",
        permission: "read",
        durationMs: 15,
      },
    });
    expect(requestBody?.idempotencyKey).toMatch(/^tool-audit:[a-f0-9]{64}$/);
  });
});
