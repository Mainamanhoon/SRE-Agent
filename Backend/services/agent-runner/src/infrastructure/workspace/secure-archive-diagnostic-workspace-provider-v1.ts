import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { extract } from "tar-stream";
import {
  DiagnosticWorkspaceProvider,
  type RepositorySnapshotRequest,
  type SourceArchiveProvider,
  type WorkspaceHandle,
} from "../../application/contracts/diagnostic-workspace-provider.js";

export interface SecureArchiveWorkspaceSettings {
  rootDirectory: string;
  maxExpandedBytes: number;
  maxFiles: number;
  maxEntryBytes: number;
}

export class SecureArchiveDiagnosticWorkspaceProviderV1 extends DiagnosticWorkspaceProvider {
  public constructor(
    private readonly source: SourceArchiveProvider,
    private readonly settings: SecureArchiveWorkspaceSettings,
  ) {
    super();
  }

  public override async acquire(request: RepositorySnapshotRequest): Promise<WorkspaceHandle> {
    if (!/^[a-f0-9]{7,64}$/i.test(request.expectedCommit))
      throw new Error("expected commit is invalid");
    const archive = await this.source.fetch(request);
    if (archive.resolvedCommit.toLowerCase() !== request.expectedCommit.toLowerCase())
      throw new Error("source archive commit does not match expected commit");
    await mkdir(this.settings.rootDirectory, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(this.settings.rootDirectory, "snapshot-"));
    try {
      await this.extract(archive.body, root);
      await this.makeReadOnly(root);
      return {
        id: randomUUID(),
        repository: request.repository,
        expectedCommit: request.expectedCommit.toLowerCase(),
        root,
      };
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      throw error;
    }
  }

  public override resolvePath(handle: WorkspaceHandle): string {
    if (
      !handle.root ||
      !resolve(handle.root).startsWith(resolve(this.settings.rootDirectory) + sep)
    )
      throw new Error("workspace handle is outside provider root");
    return handle.root;
  }

  public override async release(handle: WorkspaceHandle): Promise<void> {
    const root = this.resolvePath(handle);
    await chmod(root, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }

  private async extract(bytes: Uint8Array, root: string): Promise<void> {
    const parser = extract();
    let files = 0;
    let expandedBytes = 0;
    const extraction = new Promise<void>((resolvePromise, reject) => {
      parser.on("entry", (header, stream, next) => {
        void (async () => {
          try {
            files += 1;
            if (files > this.settings.maxFiles)
              throw new Error("source archive exceeds file count limit");
            const name = header.name.replaceAll("\\", "/");
            const normalized = posix.normalize(name);
            if (
              !name ||
              normalized === "." ||
              normalized.startsWith("../") ||
              normalized.includes("/../") ||
              posix.isAbsolute(normalized)
            )
              throw new Error("source archive contains an unsafe path");
            if (header.type === "symlink" || header.type === "link")
              throw new Error("source archive symlinks are not allowed");
            const target = resolve(root, normalized);
            if (!target.startsWith(resolve(root) + sep))
              throw new Error("source archive path escapes workspace");
            if (header.type === "directory") {
              await mkdir(target, { recursive: true, mode: 0o700 });
            } else if (header.type === "file" || header.type === undefined) {
              if (header.size > this.settings.maxEntryBytes)
                throw new Error("source archive entry exceeds size limit");
              const chunks: Buffer[] = [];
              for await (const chunk of stream) {
                const buffer = Buffer.from(chunk as Uint8Array);
                expandedBytes += buffer.byteLength;
                if (expandedBytes > this.settings.maxExpandedBytes)
                  throw new Error("expanded source archive exceeds size limit");
                chunks.push(buffer);
              }
              await mkdir(dirname(target), { recursive: true, mode: 0o700 });
              await writeFile(target, Buffer.concat(chunks), { mode: 0o600 });
            } else {
              throw new Error("source archive contains an unsupported entry type");
            }
            next();
          } catch (error) {
            stream.resume();
            reject(error);
          }
        })();
      });
      parser.on("finish", () => resolvePromise());
      parser.on("error", reject);
    });
    parser.end(gunzipSync(bytes));
    await extraction;
  }

  private async makeReadOnly(root: string): Promise<void> {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) await this.makeReadOnly(path);
      else await chmod(path, 0o444);
    }
    await chmod(root, 0o555);
  }
}
