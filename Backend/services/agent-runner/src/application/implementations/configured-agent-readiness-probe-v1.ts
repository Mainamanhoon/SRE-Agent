import { access } from "node:fs/promises";
import type { AgentRunnerConfig } from "../../config.js";
import {
  AgentReadinessProbe,
  type AgentReadinessResult,
} from "../contracts/agent-readiness-probe.js";

export class ConfiguredAgentReadinessProbeV1 extends AgentReadinessProbe {
  public constructor(
    private readonly config: AgentRunnerConfig,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {
    super();
  }

  public override async check(): Promise<AgentReadinessResult> {
    const checks: Record<string, "ready" | "not_ready"> = {};
    checks.harness =
      this.config.NODE_ENV === "production" && this.config.AGENT_HARNESS === "fake"
        ? "not_ready"
        : "ready";
    checks.credential = this.hasProviderCredential() ? "ready" : "not_ready";
    checks.mcpEntrypoint = await this.hasMcpEntrypoint();
    return { ready: Object.values(checks).every((value) => value === "ready"), checks };
  }

  private hasProviderCredential(): boolean {
    if (this.config.AGENT_HARNESS === "fake") {
      return true;
    }
    const provider = this.config.DEEPSEEK_PROVIDER.toLowerCase();
    if (provider.includes("google") || provider.includes("gemini")) {
      return Boolean(this.environment.GEMINI_API_KEY);
    }
    if (provider.includes("openai")) {
      return Boolean(this.environment.OPENAI_API_KEY);
    }
    if (provider.includes("anthropic")) {
      return Boolean(this.environment.ANTHROPIC_API_KEY);
    }
    return Boolean(this.environment.DEEPSEEK_API_KEY);
  }

  private async hasMcpEntrypoint(): Promise<"ready" | "not_ready"> {
    try {
      await access(this.config.AGENT_MCP_SERVER_ENTRYPOINT);
      return "ready";
    } catch {
      return "not_ready";
    }
  }
}
