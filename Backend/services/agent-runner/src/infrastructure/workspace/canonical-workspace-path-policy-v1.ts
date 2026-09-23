import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  type WorkspacePath,
  WorkspacePathPolicy,
} from "../../application/contracts/workspace-sources.js";

export class CanonicalWorkspacePathPolicyV1 extends WorkspacePathPolicy {
  public constructor(private readonly workspaceRoot: string) {
    super();
  }

  public override async resolveExisting(candidate: string): Promise<WorkspacePath> {
    if (isAbsolute(candidate)) {
      throw new Error("workspace paths must be relative");
    }

    const canonicalRoot = await realpath(this.workspaceRoot);
    const canonicalTarget = await realpath(resolve(canonicalRoot, candidate));
    const relativePath = relative(canonicalRoot, canonicalTarget);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..\\`) ||
      relativePath.startsWith("../") ||
      isAbsolute(relativePath)
    ) {
      throw new Error("workspace path escapes the repository root");
    }

    return {
      absolutePath: canonicalTarget,
      relativePath: relativePath.length === 0 ? "." : relativePath.replaceAll("\\", "/"),
    };
  }
}
