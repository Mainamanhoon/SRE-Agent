import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import { createActivities } from "./activities.js";
import type { WorkerConfig } from "./config.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const compiledWorkflowPath = fileURLToPath(new URL("./workflows.js", import.meta.url));
const sourceWorkflowPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));
const workflowsPath = existsSync(compiledWorkflowPath) ? compiledWorkflowPath : sourceWorkflowPath;

const connection = await connectToTemporal(config);
const worker = await Worker.create({
  connection,
  namespace: config.TEMPORAL_NAMESPACE,
  taskQueue: config.TEMPORAL_TASK_QUEUE,
  workflowsPath,
  activities: createActivities(config),
  identity: `repair-worker@${config.SERVICE_VERSION}`,
});

let ready = true;
const healthServer = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  if (request.url === "/health/live") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/health/ready") {
    response.statusCode = ready ? 200 : 503;
    response.end(JSON.stringify({ status: ready ? "ready" : "not_ready" }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not found" }));
});
await new Promise<void>((resolve, reject) => {
  healthServer.once("error", reject);
  healthServer.listen(config.WORKER_HTTP_PORT, "0.0.0.0", resolve);
});

try {
  await worker.run();
} finally {
  ready = false;
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  await connection.close();
}

async function connectToTemporal(config: WorkerConfig): Promise<NativeConnection> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.TEMPORAL_CONNECT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
    } catch (error) {
      lastError = error;
      const retryDelayMs = Math.min(1_000 * 2 ** (attempt - 1), 10_000);
      console.warn(
        `Temporal connection attempt ${attempt}/${config.TEMPORAL_CONNECT_MAX_ATTEMPTS} failed; retrying in ${retryDelayMs}ms`,
      );
      if (attempt < config.TEMPORAL_CONNECT_MAX_ATTEMPTS) {
        await delay(retryDelayMs);
      }
    }
  }

  throw lastError;
}
