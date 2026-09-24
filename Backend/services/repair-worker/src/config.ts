import { z } from "zod";

const environmentSchema = z.object({
  TEMPORAL_ADDRESS: z.string().min(1).default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().min(1).default("default"),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default("repair-workflows"),
  TEMPORAL_CONNECT_MAX_ATTEMPTS: z.coerce.number().int().positive().max(100).default(30),
  SERVICE_VERSION: z.string().min(1).default("local"),
  WORKER_HTTP_PORT: z.coerce.number().int().positive().max(65_535).default(4060),
  INCIDENT_SERVICE_URL: z.string().url().default("http://localhost:4020"),
  AGENT_RUNNER_URL: z.string().url().default("http://localhost:4040"),
  SANDBOX_CONTROLLER_URL: z.string().url().default("http://localhost:4030"),
  GITHUB_APP_URL: z.string().url().default("http://localhost:4050"),
  SANDBOX_SOURCE_BASE_URL: z.string().url().default("http://github-app:4050"),
  INTERNAL_SERVICE_TOKEN: z.string().min(32),
  DOWNSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().max(1_000_000).default(900_000),
  DOWNSTREAM_MAX_RESPONSE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(10_000_000)
    .default(2_000_000),
});

export type WorkerConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return environmentSchema.parse(environment);
}
