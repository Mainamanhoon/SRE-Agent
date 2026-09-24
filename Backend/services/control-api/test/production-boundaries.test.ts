import { afterEach, describe, expect, it } from "vitest";
import { type AppDependencies, buildApp } from "../src/app.js";
import { ControlApiQueryService } from "../src/application/contracts/control-api-query-service.js";
import {
  ControlPlaneGateway,
  type StartDiagnosisCommand,
  type SubmitCandidateCommand,
} from "../src/application/contracts/control-plane-gateway.js";
import { ControlPlaneReadinessProbe } from "../src/application/contracts/control-plane-readiness-probe.js";
import {
  RepairWorkflowGateway,
  type StartRepairCommand,
} from "../src/application/contracts/repair-workflow-gateway.js";
import { RequestAuthenticator } from "../src/application/contracts/request-authenticator.js";
import { RequestRateLimiter } from "../src/application/contracts/request-rate-limiter.js";
import { loadConfig } from "../src/config.js";

const openApps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(openApps.splice(0).map((app) => app.close())));

class StubQueries extends ControlApiQueryService {
  public getHealth() {
    return {
      status: "ok" as const,
      service: "control-api",
      version: "test",
      environment: "test" as const,
      timestamp: new Date(0).toISOString(),
    };
  }
  public getSystem() {
    return {
      name: "test",
      stage: "foundation" as const,
      capabilities: [],
      services: { incidentDetector: "test", incidentService: "test", temporal: "test" },
    };
  }
}
class StubGateway extends ControlPlaneGateway {
  public lastCandidate?: SubmitCandidateCommand;
  public async submitCandidate(command: SubmitCandidateCommand) {
    this.lastCandidate = command;
    return { fingerprint: "abc" };
  }
  public async getIncident(incidentId: string) {
    return { id: incidentId };
  }
  public async startDiagnosis(command: StartDiagnosisCommand) {
    return { repairRunId: command.repairRunId };
  }
}
class StubReadiness extends ControlPlaneReadinessProbe {
  public constructor(private readonly ready = true) {
    super();
  }
  public async check() {
    return {
      ready: this.ready,
      checks: { incidentDetector: this.ready ? ("ready" as const) : ("not_ready" as const) },
    };
  }
}
class StubAuthenticator extends RequestAuthenticator {
  public constructor(private readonly allowed: boolean) {
    super();
  }
  public authenticate() {
    return this.allowed;
  }
}
class StubRateLimiter extends RequestRateLimiter {
  public constructor(private readonly allowed: boolean) {
    super();
  }
  public allow() {
    return this.allowed;
  }
}
class StubWorkflows extends RepairWorkflowGateway {
  public lastCommand?: StartRepairCommand;
  public async start(command: StartRepairCommand) {
    this.lastCommand = command;
    return { workflowId: `repair-${command.repairRunId}`, runId: "run", status: "RUNNING" };
  }
  public async describe(repairRunId: string) {
    return { workflowId: `repair-${repairRunId}`, status: "RUNNING" };
  }
}

function dependencies(allowed = true, ready = true, admitted = true): AppDependencies {
  return {
    queries: new StubQueries(),
    gateway: new StubGateway(),
    readiness: new StubReadiness(ready),
    authenticator: new StubAuthenticator(allowed),
    rateLimiter: new StubRateLimiter(admitted),
    workflows: new StubWorkflows(),
  };
}

describe("production boundaries", () => {
  it("rejects an unsafe production configuration", () => {
    expect(() => loadConfig({ NODE_ENV: "production", API_AUTH_ENABLED: "false" })).toThrow();
  });

  it("protects the system route with the configured authenticator", async () => {
    const app = buildApp(loadConfig({ NODE_ENV: "test" }), dependencies(false));
    openApps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/system" });
    expect(response.statusCode).toBe(401);
  });

  it("accepts distinct external and internal production tokens", async () => {
    const externalToken = "external-control-api-token-00000001";
    const internalToken = "internal-service-token-00000000001";
    const app = buildApp(
      loadConfig({
        NODE_ENV: "production",
        API_AUTH_ENABLED: "true",
        API_AUTH_TOKEN: externalToken,
        INTERNAL_SERVICE_TOKEN: internalToken,
      }),
    );
    openApps.push(app);

    for (const token of [externalToken, internalToken]) {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/system",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it("validates and forwards an incident candidate", async () => {
    const deps = dependencies();
    const app = buildApp(loadConfig({ NODE_ENV: "test" }), deps);
    openApps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/incidents/candidates",
      payload: {
        service: "checkout",
        environment: "prod",
        errorType: "Timeout",
        errorMessage: "timed out",
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ fingerprint: "abc" });
    expect((deps.gateway as StubGateway).lastCandidate?.service).toBe("checkout");
  });

  it("reports dependency readiness failures", async () => {
    const app = buildApp(loadConfig({ NODE_ENV: "test" }), dependencies(true, false));
    openApps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(response.statusCode).toBe(503);
  });

  it("starts an idempotently named repair workflow", async () => {
    const deps = dependencies();
    const app = buildApp(loadConfig({ NODE_ENV: "test" }), deps);
    openApps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/repairs",
      payload: {
        incidentId: "123e4567-e89b-12d3-a456-426614174000",
        fingerprint: "fp",
        repairRunId: "run-1",
        installationId: 42,
        repository: "acme/api",
        deployedCommit: "abcdef1234567",
        baseBranch: "main",
        toolchain: "go",
        incident: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          serviceName: "api",
          environment: "production",
          exceptionType: "panic",
          exceptionMessage: "boom",
        },
        evidence: [],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().workflowId).toBe("repair-run-1");
    expect((deps.workflows as StubWorkflows).lastCommand?.repository).toBe("acme/api");
  });

  it("rejects excess ingress before calling a downstream service", async () => {
    const app = buildApp(loadConfig({ NODE_ENV: "test" }), dependencies(true, true, false));
    openApps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/system" });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("1");
  });
});
