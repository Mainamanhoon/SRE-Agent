import "dotenv/config";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  SERVICE_NAME: z.string().min(1).default("control-api"),
  SERVICE_VERSION: z.string().min(1).default("local"),
  OTEL_ENABLED: booleanString,
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default("http://localhost:4318"),
  INCIDENT_DETECTOR_URL: z.string().url().default("http://localhost:4010"),
  INCIDENT_SERVICE_URL: z.string().url().default("http://localhost:4020"),
  TEMPORAL_ADDRESS: z.string().min(1).default("localhost:7233"),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
