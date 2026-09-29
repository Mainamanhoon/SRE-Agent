import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RepairRunProjectionGateway } from "../application/contracts/repair-run-projection-gateway.js";
import { RepairRunProjectionRequestError } from "../infrastructure/http/fetch-repair-run-projection-gateway-v1.js";

const listQuery = z.object({
  incidentId: z.string().uuid().optional(),
  status: z.string().min(1).max(40).optional(),
  repository: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});

export function registerRepairRunRoutes(
  app: FastifyInstance,
  repairRuns: RepairRunProjectionGateway,
): void {
  app.get("/api/v1/repair-runs", async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_REPAIR_RUN_QUERY" });
    try {
      return reply.send(await repairRuns.list(parsed.data));
    } catch {
      return reply.code(503).send({ code: "REPAIR_RUNS_UNAVAILABLE" });
    }
  });

  app.get("/api/v1/repair-runs/:repairRunId", async (request, reply) => {
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
      return reply.send(await repairRuns.get(parsed.data.repairRunId));
    } catch (error) {
      if (error instanceof RepairRunProjectionRequestError && error.statusCode === 404)
        return reply.code(404).send({ code: "REPAIR_RUN_NOT_FOUND" });
      return reply.code(503).send({ code: "REPAIR_RUNS_UNAVAILABLE" });
    }
  });

  app.get("/api/v1/repair-runs/:repairRunId/events", async (request, reply) => {
    const parsed = z
      .object({
        repairRunId: z
          .string()
          .min(1)
          .max(63)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
      })
      .safeParse(request.params);
    const query = z
      .object({
        afterId: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .safeParse(request.query);
    if (!parsed.success || !query.success)
      return reply.code(400).send({ code: "INVALID_REPAIR_RUN_EVENT_QUERY" });
    try {
      return reply.send(
        await repairRuns.listEvents(parsed.data.repairRunId, query.data.afterId, query.data.limit),
      );
    } catch (error) {
      if (error instanceof RepairRunProjectionRequestError && error.statusCode === 404)
        return reply.code(404).send({ code: "REPAIR_RUN_NOT_FOUND" });
      return reply.code(503).send({ code: "REPAIR_RUN_EVENTS_UNAVAILABLE" });
    }
  });
}
