import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const openApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("health API", () => {
  it("reports service identity and readiness", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      SERVICE_NAME: "test-sre-agent",
      SERVICE_VERSION: "test-sha",
    });
    const app = buildApp(config);
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "test-sre-agent",
      version: "test-sha",
      environment: "test",
    });
  });
});
