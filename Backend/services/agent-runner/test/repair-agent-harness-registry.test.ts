import { describe, expect, it } from "vitest";
import { RepairAgentHarnessRegistryV1 } from "../src/application/implementations/repair-agent-harness-registry-v1.js";
import { FakeRepairAgentHarnessV1 } from "../src/infrastructure/fake/fake-repair-agent-harness-v1.js";

describe("RepairAgentHarnessRegistryV1", () => {
  it("selects a harness by its stable configuration name", () => {
    const registry = new RepairAgentHarnessRegistryV1([new FakeRepairAgentHarnessV1()]);

    expect(registry.list()).toEqual(["fake"]);
    expect(registry.resolve("fake").getCapabilities().harnessVersion).toBe("v1");
  });

  it("rejects an unregistered harness with an actionable error", () => {
    const registry = new RepairAgentHarnessRegistryV1([new FakeRepairAgentHarnessV1()]);

    expect(() => registry.resolve("codex")).toThrow(/Available harnesses: fake/);
  });
});
