import { z } from "zod";
import { createRepairToolRuntime } from "./composition/repair-tool-runtime.js";
import { loadConfig } from "./config.js";
import { McpStdioRepairToolServerV1 } from "./infrastructure/mcp/mcp-stdio-repair-tool-server-v1.js";

const launchEnvironmentSchema = z.object({
  REPAIR_RUN_ID: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
});

const config = loadConfig();
const launch = launchEnvironmentSchema.parse(process.env);
const runtime = createRepairToolRuntime(config, { allowedPermissions: ["read"] });
const server = new McpStdioRepairToolServerV1(runtime.catalog, runtime.executor, {
  serviceVersion: config.SERVICE_VERSION,
  context: {
    repairRunId: launch.REPAIR_RUN_ID,
    workspacePath: config.AGENT_WORKSPACE_PATH,
  },
  maxResultBytes: config.MCP_TOOL_MAX_RESULT_BYTES,
  onError: (error) => process.stderr.write(`${error.stack ?? error.message}\n`),
});

async function shutdown(): Promise<void> {
  await server.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().finally(() => process.exit(0));
  });
}

try {
  await server.start();
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
