import type {
  RepairToolContext,
  RepairToolDescriptor,
  RepairToolPermission,
} from "../contracts/repair-tool.js";
import {
  RepairToolAuthorizationError,
  RepairToolAuthorizationPolicy,
} from "../contracts/repair-tool-authorization.js";

export class AllowlistedRepairToolAuthorizationPolicyV1 extends RepairToolAuthorizationPolicy {
  private readonly allowedPermissions: ReadonlySet<RepairToolPermission>;

  public constructor(allowedPermissions: readonly RepairToolPermission[]) {
    super();
    this.allowedPermissions = new Set(allowedPermissions);
  }

  public override assertAllowed(
    descriptor: RepairToolDescriptor,
    _context: RepairToolContext,
  ): void {
    if (!this.allowedPermissions.has(descriptor.permission)) {
      throw new RepairToolAuthorizationError(descriptor.name, descriptor.permission);
    }
  }
}
