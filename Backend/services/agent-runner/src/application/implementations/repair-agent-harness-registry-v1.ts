import type { RepairAgentHarness } from "../contracts/repair-agent-harness.js";
import { RepairAgentHarnessRegistry } from "../contracts/repair-agent-harness-registry.js";

export class RepairAgentHarnessRegistryV1 extends RepairAgentHarnessRegistry {
  private readonly harnesses: ReadonlyMap<string, RepairAgentHarness>;

  public constructor(harnesses: readonly RepairAgentHarness[]) {
    super();
    const entries = harnesses.map(
      (harness) => [harness.getCapabilities().harness, harness] as const,
    );
    if (new Set(entries.map(([name]) => name)).size !== entries.length) {
      throw new Error("repair agent harness names must be unique");
    }
    this.harnesses = new Map(entries);
  }

  public override resolve(name: string): RepairAgentHarness {
    const harness = this.harnesses.get(name);
    if (!harness) {
      throw new Error(
        `Unknown repair agent harness "${name}". Available harnesses: ${this.list().join(", ")}`,
      );
    }
    return harness;
  }

  public override list(): readonly string[] {
    return [...this.harnesses.keys()];
  }
}
