import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AgentReadinessProbe } from "../application/contracts/agent-readiness-probe.js";
import {
  type DiagnosisAdmissionController,
  DiagnosisAdmissionRejectedError,
  DiagnosisTimeoutError,
} from "../application/contracts/diagnosis-admission-controller.js";
import type { IncidentDiagnosisService } from "../application/contracts/incident-diagnosis-service.js";
import type { RepairToolCatalog } from "../application/contracts/repair-tool.js";
import type { RequestAuthenticator } from "../application/contracts/request-authenticator.js";

const evidenceSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(["exception", "log", "metric", "source", "trace"]),
  summary: z.string().min(1).max(100_000),
  uri: z.string().min(1).max(2_000).optional(),
});

const diagnosisRequestSchema = z.object({
  repairRunId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  incident: z.object({
    id: z.string().min(1).max(200),
    serviceName: z.string().min(1).max(200),
    environment: z.string().min(1).max(100),
    exceptionType: z.string().min(1).max(500),
    exceptionMessage: z.string().min(1).max(100_000),
    stackTrace: z.string().max(500_000).optional(),
    deployedRevision: z.string().min(1).max(200).optional(),
  }),
  evidence: z.array(evidenceSchema).max(500).default([]),
});

export function registerAgentRoutes(
  app: FastifyInstance,
  diagnoses: IncidentDiagnosisService,
  tools: RepairToolCatalog,
  admission: DiagnosisAdmissionController,
  authenticator: RequestAuthenticator,
  readiness: AgentReadinessProbe,
  identity: { serviceName: string; serviceVersion: string },
): void {
  app.addHook("onRequest", async (request, reply) => {
    if (isHealthPath(request.url)) {
      return;
    }
    if (!authenticator.authenticate(request.headers.authorization)) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Authentication is required." });
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    return payload;
  });

  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: identity.serviceName,
    version: identity.serviceVersion,
  }));
  app.get("/api/v1/health/live", async () => ({ status: "ok" }));
  app.get("/api/v1/health/ready", async (_request, reply) => {
    const result = await readiness.check();
    return reply.code(result.ready ? 200 : 503).send({
      status: result.ready ? "ready" : "not_ready",
      checks: result.checks,
      admission: admission.snapshot(),
    });
  });

  app.get("/api/v1/capabilities", async () => diagnoses.getCapabilities());
  app.get("/api/v1/tools", async () => ({ tools: tools.list() }));

  app.post("/api/v1/diagnoses", async (request, reply) => {
    const parsed = diagnosisRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_DIAGNOSIS_REQUEST",
        message: "The diagnosis request is invalid.",
        issues: parsed.error.issues,
      });
    }

    const cancellation = replyCancellation(reply);
    try {
      const result = await admission.run(
        (signal) => diagnoses.diagnose(parsed.data, undefined, { signal }),
        cancellation.signal,
      );
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof DiagnosisAdmissionRejectedError) {
        reply.header("retry-after", "1");
        return reply.code(429).send({ code: "DIAGNOSIS_QUEUE_FULL" });
      }
      if (error instanceof DiagnosisTimeoutError) {
        return reply.code(504).send({ code: "DIAGNOSIS_TIMEOUT" });
      }
      throw error;
    } finally {
      cancellation.dispose();
    }
  });
}

function replyCancellation(reply: FastifyReply): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error("client disconnected"));
  reply.raw.once("close", abort);
  return {
    signal: controller.signal,
    dispose: () => reply.raw.removeListener("close", abort),
  };
}

function isHealthPath(url: string): boolean {
  const path = url.split("?", 1)[0];
  return (
    path === "/api/v1/health" || path === "/api/v1/health/live" || path === "/api/v1/health/ready"
  );
}
