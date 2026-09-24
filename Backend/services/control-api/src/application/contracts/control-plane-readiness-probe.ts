export interface ControlPlaneReadinessResult {
  ready: boolean;
  checks: Readonly<Record<string, "ready" | "not_ready">>;
}

export abstract class ControlPlaneReadinessProbe {
  public abstract check(signal?: AbortSignal): Promise<ControlPlaneReadinessResult>;
}
