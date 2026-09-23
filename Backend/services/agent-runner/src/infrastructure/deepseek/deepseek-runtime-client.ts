export interface DeepSeekNotification {
  method: string;
  params: Readonly<Record<string, unknown>>;
}

export interface DeepSeekRunResult {
  sessionId: string;
  finalResponse: string;
}

export interface DeepSeekRunOptions {
  sessionId: string;
  onNotification: (notification: DeepSeekNotification) => void;
}

export interface DeepSeekRuntimeLaunchContext {
  repairRunId: string;
}

export abstract class DeepSeekRuntimeClient {
  public abstract run(input: string, options: DeepSeekRunOptions): Promise<DeepSeekRunResult>;

  public abstract close(): Promise<void>;
}

export abstract class DeepSeekRuntimeClientFactory {
  public abstract create(context: DeepSeekRuntimeLaunchContext): DeepSeekRuntimeClient;
}
