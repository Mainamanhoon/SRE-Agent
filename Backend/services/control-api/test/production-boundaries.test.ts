import { afterEach, describe, expect, it } from "vitest";
import { type AppDependencies, buildApp } from "../src/app.js";
import { ControlApiQueryService } from "../src/application/contracts/control-api-query-service.js";
import {
  ControlPlaneGateway,
  type IncidentListQuery,
  type StartDiagnosisCommand,
  type SubmitCandidateCommand,
} from "../src/application/contracts/control-plane-gateway.js";
import { ControlPlaneReadinessProbe } from "../src/application/contracts/control-plane-readiness-probe.js";
import {
  type RepairRunListQuery,
  RepairRunProjectionGateway,
} from "../src/application/contracts/repair-run-projection-gateway.js";
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
  public lastIncidentQuery?: IncidentListQuery;
  public async submitCandidate(command: SubmitCandidateCommand) {
    this.lastCandidate = command;
    return { fingerprint: "abc" };
  }
  public async getIncident(incidentId: string) {
    return { id: incidentId };
  }
  public async listIncidents(query: IncidentListQuery) {
    this.lastIncidentQuery = query;
    return { items: [], nextCursor: query.cursor };
  }
  public async listIncidentOccurrences(incidentId: string, _limit: number, cursor?: string) {
    return { items: [], incidentId, nextCursor: cursor };
  }
  public async getIncidentActions(incidentId: string) {
    return { incidentId, currentStatus: "open", allowedActions: ["investigating"] };
  }
  public async updateIncidentStatus(incidentId: string, status: string) {
    return { id: incidentId, status };
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
class StubRepairRuns extends RepairRunProjectionGateway {
  public created?: StartRepairCommand;
  public async create(command: StartRepairCommand) {
    this.created = command;
    return {
      id: command.repairRunId,
      incidentId: command.incidentId,
      repositoryOwner: command.repository.split("/")[0] ?? "",
      repositoryName: command.repository.split("/")[1] ?? "",
      expectedCommit: command.deployedCommit,
      toolchain: command.toolchain,
      status: "queued",
      startedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      version: 1,
    };
  }
  public async get(id: string) {
    return {
      id,
      incidentId: "123e4567-e89b-12d3-a456-426614174000",
      repositoryOwner: "acme",
      repositoryName: "api",
      expectedCommit: "abcdef1234567",
      toolchain: "go" as const,
      status: "queued",
      startedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      version: 1,
    };
  }
  public async list(_query: RepairRunListQuery) {
    return { items: [] };
  }
  public async listEvents() {
    return { items: [] };
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
    repairRuns: new StubRepairRuns(),
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

  it("exposes paginated incident, occurrence, and server-approved action facades", async () => {
    const deps = dependencies();
    const app = buildApp(loadConfig({ NODE_ENV: "test" }), deps);
    openApps.push(app);
    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/incidents?status=open&service=checkout&limit=20&cursor=cursor-1",
    });
    expect(queue.statusCode).toBe(200);
    expect((deps.gateway as StubGateway).lastIncidentQuery).toEqual({
      status: "open",
      service: "checkout",
      limit: 20,
      cursor: "cursor-1",
    });

    const occurrences = await app.inject({
      method: "GET",
      url: "/api/v1/incidents/123e4567-e89b-12d3-a456-426614174000/occurrences?limit=10&cursor=older",
    });
    expect(occurrences.statusCode).toBe(200);
    expect(occurrences.json().nextCursor).toBe("older");

    const actions = await app.inject({
      method: "GET",
      url: "/api/v1/incidents/123e4567-e89b-12d3-a456-426614174000/actions",
    });
    expect(actions.statusCode).toBe(200);
    expect(actions.json().allowedActions).toEqual(["investigating"]);
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
    expect((deps.repairRuns as StubRepairRuns).created?.repairRunId).toBe("run-1");
  });

  it("rejects excess ingress before calling a downstream service", async () => {
    const app = buildApp(loadConfig({ NODE_ENV: "test" }), dependencies(true, true, false));
    openApps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/system" });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("1");
  });
});
