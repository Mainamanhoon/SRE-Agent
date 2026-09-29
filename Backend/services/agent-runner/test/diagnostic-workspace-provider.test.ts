import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { pack } from "tar-stream";
import { describe, expect, it } from "vitest";
import { SourceArchiveProvider } from "../src/application/contracts/diagnostic-workspace-provider.js";
import { SecureArchiveDiagnosticWorkspaceProviderV1 } from "../src/infrastructure/workspace/secure-archive-diagnostic-workspace-provider-v1.js";

class StubArchiveProvider extends SourceArchiveProvider {
  public constructor(
    private readonly bytes: Uint8Array,
    private readonly commit = "abcdef1234567",
  ) {
    super();
  }
  public override async fetch() {
    return { resolvedCommit: this.commit, body: this.bytes };
  }
}

async function archive(
  entries: Array<{ name: string; content?: string; type?: "file" | "symlink" }>,
): Promise<Uint8Array> {
  const tar = pack();
  const chunks: Buffer[] = [];
  tar.on("data", (chunk) => chunks.push(Buffer.from(chunk as Uint8Array)));
  const completed = new Promise<void>((resolve, reject) => {
    tar.on("end", resolve);
    tar.on("error", reject);
  });
  for (const entry of entries) {
    if (entry.type === "symlink")
      tar.entry({ name: entry.name, type: "symlink", linkname: "target" });
    else
      tar.entry(
        { name: entry.name, size: Buffer.byteLength(entry.content ?? "") },
        entry.content ?? "",
      );
  }
  tar.finalize();
  await completed;
  return new Uint8Array(gzipSync(Buffer.concat(chunks)));
}

describe("secure diagnostic workspace provider", () => {
  it("verifies the commit, rejects unsafe archives, and releases snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "sre-workspace-test-"));
    const provider = new SecureArchiveDiagnosticWorkspaceProviderV1(
      new StubArchiveProvider(
        await archive([{ name: "repo/src/app.ts", content: "export const fixed = true;" }]),
      ),
      { rootDirectory: root, maxExpandedBytes: 100_000, maxFiles: 10, maxEntryBytes: 20_000 },
    );
    const handle = await provider.acquire({
      installationId: 42,
      repository: "example/service",
      expectedCommit: "abcdef1234567",
      repairRunId: "run-1",
    });
    expect(await readFile(join(handle.root, "repo/src/app.ts"), "utf8")).toContain("fixed");
    await expect(stat(join(handle.root, "repo/src/app.ts"))).resolves.toMatchObject({
      mode: expect.any(Number),
    });
    await provider.release(handle);
    await expect(stat(handle.root)).rejects.toThrow();
    await rm(root, { recursive: true, force: true });
  });

  it("rejects commit mismatch, traversal, and symlink entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "sre-workspace-test-"));
    const settings = {
      rootDirectory: root,
      maxExpandedBytes: 100_000,
      maxFiles: 10,
      maxEntryBytes: 20_000,
    };
    await expect(
      new SecureArchiveDiagnosticWorkspaceProviderV1(
        new StubArchiveProvider(
          await archive([{ name: "repo/app.ts", content: "x" }]),
          "1234567890abcde",
        ),
        settings,
      ).acquire({
        installationId: 1,
        repository: "example/service",
        expectedCommit: "abcdef1234567",
        repairRunId: "run-1",
      }),
    ).rejects.toThrow(/does not match/);
    await expect(
      new SecureArchiveDiagnosticWorkspaceProviderV1(
        new StubArchiveProvider(await archive([{ name: "../escape", content: "x" }])),
        settings,
      ).acquire({
        installationId: 1,
        repository: "example/service",
        expectedCommit: "abcdef1234567",
        repairRunId: "run-1",
      }),
    ).rejects.toThrow(/unsafe path/);
    await expect(
      new SecureArchiveDiagnosticWorkspaceProviderV1(
        new StubArchiveProvider(await archive([{ name: "repo/link", type: "symlink" }])),
        settings,
      ).acquire({
        installationId: 1,
        repository: "example/service",
        expectedCommit: "abcdef1234567",
        repairRunId: "run-1",
      }),
    ).rejects.toThrow(/symlinks/);
    await rm(root, { recursive: true, force: true });
  });
});
