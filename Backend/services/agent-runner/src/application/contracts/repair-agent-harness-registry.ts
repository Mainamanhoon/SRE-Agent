import type { RepairAgentHarness } from "./repair-agent-harness.js";

export abstract class RepairAgentHarnessRegistry {
  public abstract resolve(name: string): RepairAgentHarness;

  public abstract list(): readonly string[];
}
