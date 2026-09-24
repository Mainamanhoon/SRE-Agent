import { resolve } from "node:path";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().max(65_535).default(4040),
    SERVICE_NAME: z.string().min(1).default("agent-runner"),
    SERVICE_VERSION: z.string().min(1).default("local"),
    CONTROL_API_URL: z.url().default("http://localhost:4000"),
    INCIDENT_SERVICE_URL: z.url().default("http://localhost:4020"),
    TRACE_QUERY_URL: z.url().default("http://localhost:16686"),
    LOKI_QUERY_URL: z.url().default("http://localhost:3100"),
    PROMETHEUS_QUERY_URL: z.url().default("http://localhost:9090"),
    KUBERNETES_DEFAULT_NAMESPACE: z.string().min(1).max(63).default("default"),
    KUBERNETES_ALLOWED_NAMESPACES: z.string().min(1).default("default"),
    KUBERNETES_SERVICE_LABEL: z.string().min(1).max(253).default("app.kubernetes.io/name"),
    API_AUTH_ENABLED: booleanString,
    API_AUTH_TOKEN: z.string().default(""),
    INTERNAL_SERVICE_TOKEN: z.string().default(""),
    BODY_LIMIT_BYTES: z.coerce.number().int().positive().max(10_000_000).default(2_000_000),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
    MAX_REQUESTS_PER_SOCKET: z.coerce.number().int().positive().max(100_000).default(1_000),
    MAX_CONCURRENT_DIAGNOSES: z.coerce.number().int().positive().max(1_000).default(20),
    MAX_QUEUED_DIAGNOSES: z.coerce.number().int().nonnegative().max(100_000).default(1_000),
    DIAGNOSIS_TIMEOUT_MS: z.coerce.number().int().positive().max(3_600_000).default(900_000),
    AGENT_HARNESS: z.enum(["deepseek", "fake"]).default("deepseek"),
    AGENT_WORKSPACE_PATH: z.string().min(1).default(process.cwd()),
    AGENT_MCP_SERVER_ENTRYPOINT: z
      .string()
      .min(1)
      .default(resolve(process.cwd(), "dist", "mcp-server.js")),
    DEEPSEEK_HOME: z
      .string()
      .min(1)
      .default(resolve(process.cwd(), ".dsh", "agent-runner")),
    DEEPSEEK_PROFILE: z.string().min(1).default("sdk"),
    DEEPSEEK_PATCH_PATHS: z.string().default(""),
    DEEPSEEK_PROVIDER: z.string().min(1).default("deepseek-official"),
    DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-flash"),
    DEEPSEEK_REASONING_EFFORT: z.enum(["off", "low", "high", "max"]).default("high"),
    DEEPSEEK_MAX_TOKENS: z.coerce.number().int().positive().max(131_072).default(16_384),
    DEEPSEEK_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(900_000),
    READ_ONLY_TOOL_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
    READ_ONLY_TOOL_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(20_000_000)
      .default(2_000_000),
    READ_ONLY_TOOL_MAX_FILE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(20_000_000)
      .default(1_000_000),
    MCP_TOOL_MAX_RESULT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(20_000_000)
      .default(2_000_000),
    MAX_TOOL_CALLS_PER_RUN: z.coerce.number().int().positive().max(1_000).default(30),
    GIT_EXECUTABLE: z.string().min(1).default("git"),
    RIPGREP_EXECUTABLE: z.string().min(1).default("rg"),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === "production" && config.AGENT_HARNESS === "fake") {
      context.addIssue({
        code: "custom",
        path: ["AGENT_HARNESS"],
        message: "the fake harness is forbidden in production",
      });
    }
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

export type AgentRunnerConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AgentRunnerConfig {
  const config = environmentSchema.parse(environment);
  return {
    ...config,
    AGENT_WORKSPACE_PATH: resolve(config.AGENT_WORKSPACE_PATH),
    AGENT_MCP_SERVER_ENTRYPOINT: resolve(config.AGENT_MCP_SERVER_ENTRYPOINT),
    DEEPSEEK_HOME: resolve(config.DEEPSEEK_HOME),
  };
}
