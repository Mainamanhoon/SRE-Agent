export type RepairToolPermission = "read" | "workspace-write" | "external-write";

export interface RepairToolDescriptor {
  name: string;
  version: string;
  description: string;
  permission: RepairToolPermission;
  inputSchema: Readonly<Record<string, unknown>>;
}

export interface RepairToolContext {
  repairRunId: string;
  workspacePath: string;
  signal?: AbortSignal;
}

export abstract class RepairTool<TInput, TOutput> {
  public abstract readonly descriptor: RepairToolDescriptor;

  public abstract validate(input: unknown): TInput;

  public abstract execute(context: RepairToolContext, input: TInput): Promise<TOutput>;
}

export abstract class RepairToolCatalog {
  public abstract list(): readonly RepairToolDescriptor[];

  public abstract get<TInput, TOutput>(name: string): RepairTool<TInput, TOutput> | undefined;
}

export abstract class RepairToolExecutor {
  public abstract execute(
    toolName: string,
    context: RepairToolContext,
    input: unknown,
  ): Promise<unknown>;
}
