import type {
  RepairToolContext,
  RepairToolDescriptor,
  RepairToolPermission,
} from "./repair-tool.js";

export class RepairToolAuthorizationError extends Error {
  public readonly code = "REPAIR_TOOL_PERMISSION_DENIED";

  public constructor(
    public readonly toolName: string,
    public readonly permission: RepairToolPermission,
  ) {
    super(`Repair tool "${toolName}" requires disallowed permission "${permission}"`);
    this.name = "RepairToolAuthorizationError";
  }
}

export abstract class RepairToolAuthorizationPolicy {
  public abstract assertAllowed(descriptor: RepairToolDescriptor, context: RepairToolContext): void;
}
