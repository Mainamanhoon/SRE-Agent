import type { RepairToolContext, RepairToolDescriptor } from "./repair-tool.js";

export class RepairToolBudgetExceededError extends Error {
  public readonly code = "REPAIR_TOOL_BUDGET_EXCEEDED";

  public constructor(
    public readonly repairRunId: string,
    public readonly maximumCalls: number,
  ) {
    super(`Repair run "${repairRunId}" exceeded its ${maximumCalls}-call tool budget`);
    this.name = "RepairToolBudgetExceededError";
  }
}

export abstract class RepairToolCallBudget {
  public abstract consume(descriptor: RepairToolDescriptor, context: RepairToolContext): void;
}
