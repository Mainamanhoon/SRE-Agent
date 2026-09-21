import type { FastifyInstance } from "fastify";
import type { ControlApiQueryService } from "../application/contracts/control-api-query-service.js";

export function registerSystemRoutes(app: FastifyInstance, queries: ControlApiQueryService): void {
  app.get("/api/v1/health", async () => queries.getHealth());
  app.get("/api/v1/system", async () => queries.getSystem());
}
