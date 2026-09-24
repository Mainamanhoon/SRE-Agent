import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RepairWorkflowGateway } from "../application/contracts/repair-workflow-gateway.js";

const evidence = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(["exception", "log", "metric", "source", "trace"]),
  summary: z.string().min(1).max(100_000),
  uri: z.string().url().max(2_000).optional(),
});
const startRepair = z.object({
  incidentId: z.string().uuid(),
  fingerprint: z.string().min(1).max(256),
  repairRunId: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  installationId: z.number().int().positive(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  deployedCommit: z.string().regex(/^[a-fA-F0-9]{7,64}$/),
  baseBranch: z.string().min(1).max(200),
  toolchain: z.enum(["node", "go"]),
  incident: z.object({
    id: z.string().min(1),
    serviceName: z.string().min(1),
    environment: z.string().min(1),
    exceptionType: z.string().min(1),
    exceptionMessage: z.string().min(1),
    stackTrace: z.string().optional(),
    deployedRevision: z.string().optional(),
  }),
  evidence: z.array(evidence).max(500).default([]),
});

export function registerRepairRoutes(app: FastifyInstance, workflows: RepairWorkflowGateway): void {
  app.post("/api/v1/repairs", async (request, reply) => {
    const parsed = startRepair.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ code: "INVALID_REPAIR_REQUEST", issues: parsed.error.issues });
    try {
      return reply.code(202).send(await workflows.start(parsed.data));
    } catch {
      return reply.code(503).send({ code: "WORKFLOW_UNAVAILABLE" });
    }
  });
  app.get("/api/v1/repairs/:repairRunId", async (request, reply) => {
    const parsed = z
      .object({
        repairRunId: z
          .string()
          .min(1)
          .max(63)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
      })
      .safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_REPAIR_RUN_ID" });
    try {
      return reply.send(await workflows.describe(parsed.data.repairRunId));
    } catch {
      return reply.code(404).send({ code: "WORKFLOW_NOT_FOUND" });
    }
  });
}
