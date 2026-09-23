import type { RepairToolContext, RepairToolDescriptor } from "../contracts/repair-tool.js";
import {
  RepairToolBudgetExceededError,
  RepairToolCallBudget,
} from "../contracts/repair-tool-budget.js";

export class InMemoryRepairToolCallBudgetV1 extends RepairToolCallBudget {
  private readonly callsByRun = new Map<string, number>();

  public constructor(private readonly maximumCalls: number) {
    super();
    if (!Number.isInteger(maximumCalls) || maximumCalls <= 0) {
      throw new Error("maximumCalls must be a positive integer");
    }
  }

  public override consume(_descriptor: RepairToolDescriptor, context: RepairToolContext): void {
    const next = (this.callsByRun.get(context.repairRunId) ?? 0) + 1;
    if (next > this.maximumCalls) {
      throw new RepairToolBudgetExceededError(context.repairRunId, this.maximumCalls);
    }
    this.callsByRun.set(context.repairRunId, next);
  }
}
