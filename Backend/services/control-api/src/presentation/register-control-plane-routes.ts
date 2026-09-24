import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneGateway } from "../application/contracts/control-plane-gateway.js";
import type { ControlPlaneReadinessProbe } from "../application/contracts/control-plane-readiness-probe.js";
import type { RequestAuthenticator } from "../application/contracts/request-authenticator.js";
import type { RequestRateLimiter } from "../application/contracts/request-rate-limiter.js";
import { DownstreamRequestError } from "../infrastructure/http/fetch-control-plane-gateway-v1.js";

const candidateSchema = z.object({
  service: z.string().min(1).max(200),
  environment: z.string().min(1).max(100),
  errorType: z.string().min(1).max(500),
  errorMessage: z.string().min(1).max(100_000),
  topFrame: z.string().max(2_000).optional(),
  traceId: z.string().max(64).optional(),
  severity: z.string().min(1).max(50).optional(),
});

const diagnosisSchema = z.object({
  repairRunId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  incident: z.record(z.string(), z.unknown()),
  evidence: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
});

export function registerControlPlaneRoutes(
  app: FastifyInstance,
  gateway: ControlPlaneGateway,
  readiness: ControlPlaneReadinessProbe,
  authenticator: RequestAuthenticator,
  rateLimiter: RequestRateLimiter,
): void {
  app.addHook("onRequest", async (request, reply) => {
    if (isHealthPath(request.url)) return;
    if (!authenticator.authenticate(request.headers.authorization)) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Authentication is required." });
    }
  });
  app.addHook("onRequest", async (request, reply) => {
    if (isHealthPath(request.url)) return;
    if (!rateLimiter.allow()) {
      reply.header("retry-after", "1");
      return reply.code(429).send({ code: "RATE_LIMIT_EXCEEDED" });
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    return payload;
  });

  app.get("/api/v1/health/live", async () => ({ status: "ok" }));
  app.get("/api/v1/health/ready", async (_request, reply) => {
    const cancellation = replyCancellation(reply);
    try {
      const result = await readiness.check(cancellation.signal);
      return reply.code(result.ready ? 200 : 503).send({
        status: result.ready ? "ready" : "not_ready",
        checks: result.checks,
      });
    } finally {
      cancellation.dispose();
    }
  });

  app.post("/api/v1/incidents/candidates", async (request, reply) => {
    const parsed = candidateSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues);
    const cancellation = replyCancellation(reply);
    try {
      return reply.code(202).send(await gateway.submitCandidate(parsed.data, cancellation.signal));
    } catch (error) {
      return downstreamFailure(reply, error);
    } finally {
      cancellation.dispose();
    }
  });

  app.get("/api/v1/incidents/:incidentId", async (request, reply) => {
    const parsed = z.object({ incidentId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues);
    const cancellation = replyCancellation(reply);
    try {
      return reply
        .code(200)
        .send(await gateway.getIncident(parsed.data.incidentId, cancellation.signal));
    } catch (error) {
      return downstreamFailure(reply, error);
    } finally {
      cancellation.dispose();
    }
  });

  app.post("/api/v1/diagnoses", async (request, reply) => {
    const parsed = diagnosisSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues);
    const cancellation = replyCancellation(reply);
    try {
      return reply.code(200).send(await gateway.startDiagnosis(parsed.data, cancellation.signal));
    } catch (error) {
      return downstreamFailure(reply, error);
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

function invalidRequest(reply: FastifyReply, issues: unknown) {
  return reply.code(400).send({ code: "INVALID_REQUEST", issues });
}

function downstreamFailure(reply: FastifyReply, error: unknown) {
  if (
    error instanceof DownstreamRequestError &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    return reply.code(error.statusCode).send({ code: "DOWNSTREAM_REJECTED" });
  }
  return reply.code(502).send({ code: "DOWNSTREAM_UNAVAILABLE" });
}

function isHealthPath(url: string): boolean {
  const path = url.split("?", 1)[0];
  return (
    path === "/api/v1/health" || path === "/api/v1/health/live" || path === "/api/v1/health/ready"
  );
}
