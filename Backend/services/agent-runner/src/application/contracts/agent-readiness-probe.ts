export interface AgentReadinessResult {
  ready: boolean;
  checks: Readonly<Record<string, "ready" | "not_ready">>;
}

export abstract class AgentReadinessProbe {
  public abstract check(): Promise<AgentReadinessResult>;
}
