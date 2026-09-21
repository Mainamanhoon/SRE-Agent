import { existsSync } from "node:fs";
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
  activities: createActivities(),
  identity: `repair-worker@${config.SERVICE_VERSION}`,
});

try {
  await worker.run();
} finally {
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
