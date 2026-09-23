import { readFile, stat } from "node:fs/promises";
import type { WorkspacePathPolicy } from "../../application/contracts/workspace-sources.js";
import {
  type FileRange,
  WorkspaceFileSource,
} from "../../application/contracts/workspace-sources.js";

export class NodeWorkspaceFileSourceV1 extends WorkspaceFileSource {
  public constructor(
    private readonly paths: WorkspacePathPolicy,
    private readonly maxFileBytes: number,
  ) {
    super();
  }

  public override async readRange(
    path: string,
    startLine: number,
    endLine: number,
  ): Promise<FileRange> {
    const resolved = await this.paths.resolveExisting(path);
    const metadata = await stat(resolved.absolutePath);
    if (!metadata.isFile()) {
      throw new Error("requested workspace path is not a file");
    }
    if (metadata.size > this.maxFileBytes) {
      throw new Error(`requested file exceeds the ${this.maxFileBytes}-byte limit`);
    }

    const content = await readFile(resolved.absolutePath, "utf8");
    if (content.includes("\0")) {
      throw new Error("binary files cannot be read through readFileRange");
    }
    const lines = content.split(/\r?\n/);
    const boundedEnd = Math.min(endLine, lines.length);
    return {
      path: resolved.relativePath,
      startLine,
      endLine: boundedEnd,
      totalLines: lines.length,
      content: startLine > lines.length ? "" : lines.slice(startLine - 1, boundedEnd).join("\n"),
    };
  }
}
