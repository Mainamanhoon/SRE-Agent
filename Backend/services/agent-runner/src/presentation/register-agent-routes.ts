import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { IncidentDiagnosisService } from "../application/contracts/incident-diagnosis-service.js";
import type { RepairToolCatalog } from "../application/contracts/repair-tool.js";

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
  identity: { serviceName: string; serviceVersion: string },
): void {
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: identity.serviceName,
    version: identity.serviceVersion,
  }));

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

    const result = await diagnoses.diagnose(parsed.data);
    return reply.code(200).send(result);
  });
}
