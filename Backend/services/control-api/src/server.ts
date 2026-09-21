import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { startTelemetry, stopTelemetry } from "./telemetry.js";

const config = loadConfig();
await startTelemetry(config);

const app = buildApp(config);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await stopTelemetry();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  await stopTelemetry();
  process.exit(1);
}
