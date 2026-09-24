import { resolve } from "node:path";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import { DeepSeekHarness, type HarnessNotification } from "@deepseek-ai/dsh-sdk-client";
import type { AgentRunnerConfig } from "../../config.js";
import {
  type DeepSeekRunOptions,
  type DeepSeekRunResult,
  DeepSeekRuntimeClient,
  DeepSeekRuntimeClientFactory,
  type DeepSeekRuntimeLaunchContext,
} from "./deepseek-runtime-client.js";

export class DeepSeekSdkRuntimeClientV1 extends DeepSeekRuntimeClient {
  public constructor(private readonly harness: DeepSeekHarness) {
    super();
  }

  public override async run(
    input: string,
    options: DeepSeekRunOptions,
  ): Promise<DeepSeekRunResult> {
    const result = await this.harness.run(input, {
      sessionId: options.sessionId,
      onNotification: (notification: HarnessNotification) => options.onNotification(notification),
    });
    return {
      sessionId: result.sessionId,
      finalResponse: result.finalResponse,
    };
  }

  public override close(): Promise<void> {
    return this.harness.close();
  }
}

export class DeepSeekSdkRuntimeClientFactoryV1 extends DeepSeekRuntimeClientFactory {
  public constructor(private readonly config: AgentRunnerConfig) {
    super();
  }

  public override create(context: DeepSeekRuntimeLaunchContext): DeepSeekRuntimeClient {
    const childEnvironment = {
      ...selectHarnessEnvironment(process.env),
      API_AUTH_ENABLED: String(this.config.API_AUTH_ENABLED),
      API_AUTH_TOKEN: this.config.API_AUTH_TOKEN,
      AGENT_MCP_SERVER_ENTRYPOINT: this.config.AGENT_MCP_SERVER_ENTRYPOINT,
      AGENT_WORKSPACE_PATH: this.config.AGENT_WORKSPACE_PATH,
      CONTROL_API_URL: this.config.CONTROL_API_URL,
      DSH_PERMISSION_MODE: "read-only",
      GIT_EXECUTABLE: this.config.GIT_EXECUTABLE,
      INCIDENT_SERVICE_URL: this.config.INCIDENT_SERVICE_URL,
      INTERNAL_SERVICE_TOKEN: this.config.INTERNAL_SERVICE_TOKEN,
      KUBERNETES_ALLOWED_NAMESPACES: this.config.KUBERNETES_ALLOWED_NAMESPACES,
      KUBERNETES_DEFAULT_NAMESPACE: this.config.KUBERNETES_DEFAULT_NAMESPACE,
      KUBERNETES_SERVICE_LABEL: this.config.KUBERNETES_SERVICE_LABEL,
      LOKI_QUERY_URL: this.config.LOKI_QUERY_URL,
      MAX_TOOL_CALLS_PER_RUN: String(this.config.MAX_TOOL_CALLS_PER_RUN),
      MCP_TOOL_MAX_RESULT_BYTES: String(this.config.MCP_TOOL_MAX_RESULT_BYTES),
      READ_ONLY_TOOL_MAX_FILE_BYTES: String(this.config.READ_ONLY_TOOL_MAX_FILE_BYTES),
      READ_ONLY_TOOL_MAX_RESPONSE_BYTES: String(this.config.READ_ONLY_TOOL_MAX_RESPONSE_BYTES),
      READ_ONLY_TOOL_TIMEOUT_MS: String(this.config.READ_ONLY_TOOL_TIMEOUT_MS),
      PROMETHEUS_QUERY_URL: this.config.PROMETHEUS_QUERY_URL,
      REPAIR_RUN_ID: context.repairRunId,
      RIPGREP_EXECUTABLE: this.config.RIPGREP_EXECUTABLE,
      SERVICE_VERSION: this.config.SERVICE_VERSION,
      TRACE_QUERY_URL: this.config.TRACE_QUERY_URL,
    };
    const runHome = resolveRunHome(this.config.DEEPSEEK_HOME, context.repairRunId);
    const harness = new DeepSeekHarness({
      cwd: this.config.AGENT_WORKSPACE_PATH,
      dshHome: runHome,
      env: childEnvironment,
      maxTokens: this.config.DEEPSEEK_MAX_TOKENS,
      model: this.config.DEEPSEEK_MODEL,
      patches: parsePatchPaths(this.config.DEEPSEEK_PATCH_PATHS),
      profile: this.config.DEEPSEEK_PROFILE,
      provider: this.config.DEEPSEEK_PROVIDER,
      reasoningEffort: ReasoningEffortId(this.config.DEEPSEEK_REASONING_EFFORT),
      requestTimeoutMs: this.config.DEEPSEEK_REQUEST_TIMEOUT_MS,
    });
    return new DeepSeekSdkRuntimeClientV1(harness);
  }
}

export function selectHarnessEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const exactKeys = new Set([
    "ANTHROPIC_API_KEY",
    "CI",
    "DEEPSEEK_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "HOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "NODE_EXTRA_CA_CERTS",
    "NODE_OPTIONS",
    "NO_PROXY",
    "OPENAI_API_KEY",
    "PATH",
    "PATHEXT",
    "Path",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SystemRoot",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ]);
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) =>
        value !== undefined && (exactKeys.has(key) || key.startsWith("KUBERNETES_SERVICE_")),
    ),
  );
}

function parsePatchPaths(value: string): string[] {
  return value
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .map((path) => resolve(path));
}

function resolveRunHome(basePath: string, repairRunId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(repairRunId)) {
    throw new Error("repairRunId is not safe for a DeepSeek Harness state directory");
  }
  return resolve(basePath, repairRunId);
}
