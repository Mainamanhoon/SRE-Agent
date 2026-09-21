import { z } from "zod";

const environmentSchema = z.object({
  TEMPORAL_ADDRESS: z.string().min(1).default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().min(1).default("default"),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default("repair-workflows"),
  TEMPORAL_CONNECT_MAX_ATTEMPTS: z.coerce.number().int().positive().max(100).default(30),
  SERVICE_VERSION: z.string().min(1).default("local"),
});

export type WorkerConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return environmentSchema.parse(environment);
}
