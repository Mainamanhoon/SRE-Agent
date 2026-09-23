import {
  type ReadOnlyProcessRunner,
  type RecentChange,
  type RecentChangesQuery,
  RecentChangesSource,
  type WorkspacePathPolicy,
} from "../../application/contracts/workspace-sources.js";

export interface GitRecentChangesSourceOptions {
  executable: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export class GitRecentChangesSourceV1 extends RecentChangesSource {
  public constructor(
    private readonly paths: WorkspacePathPolicy,
    private readonly processes: ReadOnlyProcessRunner,
    private readonly options: GitRecentChangesSourceOptions,
  ) {
    super();
  }

  public override async getRecentChanges(
    query: RecentChangesQuery,
    signal?: AbortSignal,
  ): Promise<RecentChange[]> {
    const root = await this.paths.resolveExisting(".");
    const target = query.path ? await this.paths.resolveExisting(query.path) : undefined;
    const args = [
      "log",
      "--no-color",
      "--no-show-signature",
      `--max-count=${query.maxCommits}`,
      "--format=%H%x1f%an%x1f%aI%x1f%s%x1e",
    ];
    if (target) {
      args.push("--", target.relativePath);
    }

    const result = await this.processes.run({
      executable: this.options.executable,
      args,
      cwd: root.absolutePath,
      timeoutMs: this.options.timeoutMs,
      maxOutputBytes: this.options.maxOutputBytes,
      signal,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `git history failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
      );
    }

    return result.stdout
      .split("\u001e")
      .map((record) => record.trim())
      .filter((record) => record.length > 0)
      .map(parseRecentChange)
      .filter((change): change is RecentChange => change !== undefined)
      .slice(0, query.maxCommits);
  }
}

function parseRecentChange(record: string): RecentChange | undefined {
  const [commit, author, authoredAt, ...subjectParts] = record.split("\u001f");
  const subject = subjectParts.join("\u001f");
  if (!commit || !author || !authoredAt || !subject) return undefined;
  return { commit, author, authoredAt, subject };
}
