import { dirname, parse } from "node:path";
import {
  type FindTestsQuery,
  type ReadOnlyProcessRunner,
  TestFileSource,
  type WorkspacePathPolicy,
} from "../../application/contracts/workspace-sources.js";
import type { RipgrepSourceOptions } from "./ripgrep-code-search-source-v1.js";

export class RipgrepTestFileSourceV1 extends TestFileSource {
  public constructor(
    private readonly paths: WorkspacePathPolicy,
    private readonly processes: ReadOnlyProcessRunner,
    private readonly options: RipgrepSourceOptions,
  ) {
    super();
  }

  public override async findTests(query: FindTestsQuery, signal?: AbortSignal): Promise<string[]> {
    const root = await this.paths.resolveExisting(".");
    const source = query.sourcePath
      ? await this.paths.resolveExisting(query.sourcePath)
      : undefined;
    const result = await this.processes.run({
      executable: this.options.executable,
      args: [
        "--files",
        "--glob",
        "*.test.*",
        "--glob",
        "*.spec.*",
        "--glob",
        "test/**",
        "--glob",
        "tests/**",
        "--glob",
        "__tests__/**",
        ".",
      ],
      cwd: root.absolutePath,
      timeoutMs: this.options.timeoutMs,
      maxOutputBytes: this.options.maxOutputBytes,
      signal,
    });
    if (result.exitCode === 1) return [];
    if (result.exitCode !== 0) {
      throw new Error(
        `test discovery failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
      );
    }

    const candidates = result.stdout
      .split(/\r?\n/)
      .filter((path) => path.length > 0)
      .map((path) => path.replaceAll("\\", "/").replace(/^\.\//, ""));
    return candidates
      .map((path) => ({ path, score: scoreTest(path, source?.relativePath, query.symbol) }))
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, query.maxResults)
      .map(({ path }) => path);
  }
}

function scoreTest(testPath: string, sourcePath?: string, symbol?: string): number {
  const normalized = testPath.toLowerCase();
  let score = /(^|\/)__?tests?__?(\/|$)/i.test(testPath) ? 10 : 0;
  if (sourcePath) {
    const source = sourcePath.replaceAll("\\", "/");
    const sourceStem = parse(source).name.toLowerCase();
    if (normalized.includes(sourceStem)) score += 100;
    if (dirname(testPath).toLowerCase() === dirname(source).toLowerCase()) score += 50;
  }
  if (symbol && normalized.includes(symbol.toLowerCase())) score += 40;
  return score;
}
