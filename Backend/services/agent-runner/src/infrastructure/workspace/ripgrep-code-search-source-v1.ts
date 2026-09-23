import {
  type CodeSearchMatch,
  type CodeSearchQuery,
  CodeSearchSource,
  type ReadOnlyProcessRunner,
  type WorkspacePathPolicy,
} from "../../application/contracts/workspace-sources.js";

export interface RipgrepSourceOptions {
  executable: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export class RipgrepCodeSearchSourceV1 extends CodeSearchSource {
  public constructor(
    private readonly paths: WorkspacePathPolicy,
    private readonly processes: ReadOnlyProcessRunner,
    private readonly options: RipgrepSourceOptions,
  ) {
    super();
  }

  public override async search(
    query: CodeSearchQuery,
    signal?: AbortSignal,
  ): Promise<CodeSearchMatch[]> {
    const root = await this.paths.resolveExisting(".");
    const target = query.path ? await this.paths.resolveExisting(query.path) : root;
    const args = ["--line-number", "--column", "--no-heading", "--color", "never"];
    if (!query.isRegex) args.push("--fixed-strings");
    if (!query.caseSensitive) args.push("--ignore-case");
    args.push("--max-filesize", "2M", "--", query.query, target.relativePath);

    const result = await this.processes.run({
      executable: this.options.executable,
      args,
      cwd: root.absolutePath,
      timeoutMs: this.options.timeoutMs,
      maxOutputBytes: this.options.maxOutputBytes,
      signal,
    });
    if (result.exitCode === 1) return [];
    if (result.exitCode !== 0) {
      throw new Error(
        `code search failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
      );
    }

    return result.stdout
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map(parseMatch)
      .filter((match): match is CodeSearchMatch => match !== undefined)
      .slice(0, query.maxResults);
  }
}

function parseMatch(line: string): CodeSearchMatch | undefined {
  const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(line);
  if (!match) return undefined;
  const [, path, lineNumber, column, preview] = match;
  if (!path || !lineNumber || !column || preview === undefined) return undefined;
  return {
    path: path.replaceAll("\\", "/").replace(/^\.\//, ""),
    line: Number(lineNumber),
    column: Number(column),
    preview,
  };
}
