export interface WorkspacePath {
  absolutePath: string;
  relativePath: string;
}

export abstract class WorkspacePathPolicy {
  public abstract resolveExisting(relativePath: string): Promise<WorkspacePath>;
}

export interface FileRange {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
}

export abstract class WorkspaceFileSource {
  public abstract readRange(path: string, startLine: number, endLine: number): Promise<FileRange>;
}

export interface CodeSearchQuery {
  query: string;
  path?: string;
  isRegex: boolean;
  caseSensitive: boolean;
  maxResults: number;
}

export interface CodeSearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export abstract class CodeSearchSource {
  public abstract search(query: CodeSearchQuery, signal?: AbortSignal): Promise<CodeSearchMatch[]>;
}

export interface FindTestsQuery {
  sourcePath?: string;
  symbol?: string;
  maxResults: number;
}

export abstract class TestFileSource {
  public abstract findTests(query: FindTestsQuery, signal?: AbortSignal): Promise<string[]>;
}

export interface RecentChangesQuery {
  path?: string;
  maxCommits: number;
}

export interface RecentChange {
  commit: string;
  author: string;
  authoredAt: string;
  subject: string;
}

export abstract class RecentChangesSource {
  public abstract getRecentChanges(
    query: RecentChangesQuery,
    signal?: AbortSignal,
  ): Promise<RecentChange[]>;
}

export interface ReadOnlyProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ReadOnlyProcessRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}

export abstract class ReadOnlyProcessRunner {
  public abstract run(request: ReadOnlyProcessRequest): Promise<ReadOnlyProcessResult>;
}
