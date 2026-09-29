export interface RepositorySnapshotRequest {
  installationId: number;
  repository: string;
  expectedCommit: string;
  repairRunId: string;
}

export interface WorkspaceHandle {
  id: string;
  repository: string;
  expectedCommit: string;
  root: string;
}

export interface SourceArchive {
  resolvedCommit: string;
  body: Uint8Array;
}

export abstract class SourceArchiveProvider {
  public abstract fetch(
    request: Omit<RepositorySnapshotRequest, "repairRunId">,
  ): Promise<SourceArchive>;
}

export abstract class DiagnosticWorkspaceProvider {
  public abstract acquire(request: RepositorySnapshotRequest): Promise<WorkspaceHandle>;
  public abstract resolvePath(handle: WorkspaceHandle): string;
  public abstract release(handle: WorkspaceHandle): Promise<void>;
}
