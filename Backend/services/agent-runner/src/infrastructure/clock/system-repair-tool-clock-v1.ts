import { RepairToolClock } from "../../application/contracts/repair-tool-audit.js";

export class SystemRepairToolClockV1 extends RepairToolClock {
  public override now(): number {
    return Date.now();
  }
}
