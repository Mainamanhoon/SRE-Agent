import {
  type RepairTool,
  RepairToolCatalog,
  type RepairToolDescriptor,
} from "../contracts/repair-tool.js";

export class RepairToolCatalogV1 extends RepairToolCatalog {
  private readonly tools: ReadonlyMap<string, RepairTool<unknown, unknown>>;

  public constructor(tools: readonly RepairTool<unknown, unknown>[]) {
    super();
    const entries = tools.map((tool) => [tool.descriptor.name, tool] as const);
    if (new Set(entries.map(([name]) => name)).size !== entries.length) {
      throw new Error("repair tool names must be unique");
    }
    this.tools = new Map(entries);
  }

  public override list(): readonly RepairToolDescriptor[] {
    return [...this.tools.values()].map((tool) => tool.descriptor);
  }

  public override get<TInput, TOutput>(name: string): RepairTool<TInput, TOutput> | undefined {
    return this.tools.get(name) as RepairTool<TInput, TOutput> | undefined;
  }
}
