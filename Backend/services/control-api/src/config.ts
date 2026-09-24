import "dotenv/config";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z
  .object({
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
    AGENT_RUNNER_URL: z.string().url().default("http://localhost:4040"),
    AGENT_RUNNER_REQUIRED: booleanString,
    TEMPORAL_ADDRESS: z.string().min(1).default("localhost:7233"),
    TEMPORAL_NAMESPACE: z.string().min(1).default("default"),
    TEMPORAL_TASK_QUEUE: z.string().min(1).default("repair-workflows"),
    API_AUTH_ENABLED: booleanString,
    API_AUTH_TOKEN: z.string().default(""),
    INTERNAL_SERVICE_TOKEN: z.string().default(""),
    BODY_LIMIT_BYTES: z.coerce.number().int().positive().max(10_000_000).default(2_000_000),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
    DOWNSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(10_000),
    DOWNSTREAM_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(20_000_000)
      .default(2_000_000),
    MAX_REQUESTS_PER_SOCKET: z.coerce.number().int().positive().max(100_000).default(1_000),
    REQUESTS_PER_SECOND: z.coerce.number().int().positive().max(100_000).default(2_000),
    REQUEST_BURST: z.coerce.number().int().positive().max(200_000).default(4_000),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === "production" && !config.API_AUTH_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["API_AUTH_ENABLED"],
        message: "API authentication must be enabled in production",
      });
    }
    if (config.API_AUTH_ENABLED && config.API_AUTH_TOKEN.length < 32) {
      context.addIssue({
        code: "custom",
        path: ["API_AUTH_TOKEN"],
        message: "API authentication token must contain at least 32 characters",
      });
    }
    if (config.NODE_ENV === "production" && config.INTERNAL_SERVICE_TOKEN.length < 32) {
      context.addIssue({
        code: "custom",
        path: ["INTERNAL_SERVICE_TOKEN"],
        message: "internal service token must contain at least 32 characters in production",
      });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
