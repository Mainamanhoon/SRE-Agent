import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const openApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("agent runner API", () => {
  it("selects the fake harness through configuration", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      AGENT_HARNESS: "fake",
      SERVICE_VERSION: "test-sha",
    });
    const app = buildApp(config);
    openApps.push(app);

    const capabilities = await app.inject({ method: "GET", url: "/api/v1/capabilities" });
    expect(capabilities.statusCode).toBe(200);
    expect(capabilities.json()).toMatchObject({ harness: "fake", modes: ["diagnosis"] });

    const tools = await app.inject({ method: "GET", url: "/api/v1/tools" });
    expect(tools.statusCode).toBe(200);
    expect(tools.json()).toMatchObject({
      tools: [
        { name: "getServiceTopology", permission: "read" },
        { name: "getIncident", permission: "read" },
        { name: "getTrace", permission: "read" },
        { name: "queryLogs", permission: "read" },
        { name: "queryMetrics", permission: "read" },
        { name: "getDeploymentContext", permission: "read" },
        { name: "getRecentChanges", permission: "read" },
        { name: "readFileRange", permission: "read" },
        { name: "searchCode", permission: "read" },
        { name: "findTests", permission: "read" },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/diagnoses",
      payload: {
        repairRunId: "repair-1",
        incident: {
          id: "incident-1",
          serviceName: "checkout",
          environment: "production",
          exceptionType: "TypeError",
          exceptionMessage: "Cannot read properties of undefined",
        },
        evidence: [],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      harness: "fake",
      runId: "repair-1",
      status: "completed",
    });
  });

  it("rejects invalid run identifiers", async () => {
    const app = buildApp(loadConfig({ NODE_ENV: "test", AGENT_HARNESS: "fake" }));
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/diagnoses",
      payload: { repairRunId: "../escape", incident: {}, evidence: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_DIAGNOSIS_REQUEST" });
  });

  it("protects non-health routes when API authentication is enabled", async () => {
    const token = "production-test-token-that-is-long";
    const app = buildApp(
      loadConfig({
        NODE_ENV: "test",
        AGENT_HARNESS: "fake",
        API_AUTH_ENABLED: "true",
        API_AUTH_TOKEN: token,
      }),
    );
    openApps.push(app);

    const health = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(health.statusCode).toBe(200);
    const unauthorized = await app.inject({ method: "GET", url: "/api/v1/tools" });
    expect(unauthorized.statusCode).toBe(401);
    const authorized = await app.inject({
      method: "GET",
      url: "/api/v1/tools",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authorized.statusCode).toBe(200);
  });
});
