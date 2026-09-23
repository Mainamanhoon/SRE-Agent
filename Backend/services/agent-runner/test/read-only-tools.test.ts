import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  IncidentEvidenceSource,
  ServiceTopologyEvidenceSource,
  TraceEvidenceSource,
} from "../src/application/contracts/evidence-sources.js";
import {
  type CodeSearchQuery,
  CodeSearchSource,
  type FileRange,
  type FindTestsQuery,
  type ReadOnlyProcessRequest,
  ReadOnlyProcessRunner,
  type RecentChangesQuery,
  RecentChangesSource,
  TestFileSource,
  WorkspaceFileSource,
} from "../src/application/contracts/workspace-sources.js";
import { FindTestsToolV1 } from "../src/application/tools/find-tests-tool-v1.js";
import { GetIncidentToolV1 } from "../src/application/tools/get-incident-tool-v1.js";
import { GetRecentChangesToolV1 } from "../src/application/tools/get-recent-changes-tool-v1.js";
import { GetServiceTopologyToolV1 } from "../src/application/tools/get-service-topology-tool-v1.js";
import { GetTraceToolV1 } from "../src/application/tools/get-trace-tool-v1.js";
import { ReadFileRangeToolV1 } from "../src/application/tools/read-file-range-tool-v1.js";
import { SearchCodeToolV1 } from "../src/application/tools/search-code-tool-v1.js";

class StubIncidentSource extends IncidentEvidenceSource {
  public override async getIncident(incidentId: string) {
    return {
      id: incidentId,
      fingerprint: "fingerprint",
      service: "checkout",
      environment: "production",
      severity: "error",
      status: "open",
      occurrenceCount: 2,
      firstSeenAt: "2026-09-23T00:00:00Z",
      lastSeenAt: "2026-09-23T00:01:00Z",
    };
  }
}

class StubServiceTopologySource extends ServiceTopologyEvidenceSource {
  public override async getServiceTopology() {
    return {
      name: "SRE Agent",
      stage: "foundation",
      capabilities: ["incident-correlation"],
      services: { incidentService: "http://incident-service:4020" },
    };
  }
}

class StubTraceSource extends TraceEvidenceSource {
  public override async getTrace(traceId: string) {
    return { traceId, payload: { data: [] } };
  }
}

class StubFileSource extends WorkspaceFileSource {
  public override async readRange(
    path: string,
    startLine: number,
    endLine: number,
  ): Promise<FileRange> {
    return { path, startLine, endLine, totalLines: 1, content: "source" };
  }
}

class StubCodeSource extends CodeSearchSource {
  public override async search(query: CodeSearchQuery) {
    return [{ path: "src/parser.ts", line: 4, column: 2, preview: query.query }];
  }
}

class StubTestSource extends TestFileSource {
  public override async findTests(_query: FindTestsQuery) {
    return ["src/parser.test.ts"];
  }
}

class StubRecentChangesSource extends RecentChangesSource {
  public override async getRecentChanges(query: RecentChangesQuery) {
    return [
      {
        commit: "abc123",
        author: "Developer",
        authoredAt: "2026-09-23T00:00:00Z",
        subject: query.path ? `Change ${query.path}` : "Repository change",
      },
    ];
  }
}

class StubProcessRunner extends ReadOnlyProcessRunner {
  public request?: ReadOnlyProcessRequest;

  public override async run(request: ReadOnlyProcessRequest) {
    this.request = request;
    return {
      exitCode: 0,
      stdout: "abc123\u001fDeveloper\u001f2026-09-23T00:00:00Z\u001fFix parser\u001e\n",
      stderr: "",
    };
  }
}

const context = { repairRunId: "repair-1", workspacePath: "C:/workspace" };

describe("project-owned read-only tools", () => {
  it("validates and executes configured service topology reads", async () => {
    const tool = new GetServiceTopologyToolV1(new StubServiceTopologySource());

    await expect(tool.execute(context, tool.validate({}))).resolves.toMatchObject({
      stage: "foundation",
      services: { incidentService: "http://incident-service:4020" },
    });
    expect(() => tool.validate({ repairRunId: "untrusted" })).toThrow();
  });

  it("validates and executes incident and trace reads", async () => {
    const incidentTool = new GetIncidentToolV1(new StubIncidentSource());
    const traceTool = new GetTraceToolV1(new StubTraceSource());
    const incidentInput = incidentTool.validate({
      incidentId: "8cb1bb40-215d-4b22-92b2-b080ddbd3166",
    });
    const traceInput = traceTool.validate({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736" });

    await expect(incidentTool.execute(context, incidentInput)).resolves.toMatchObject({
      service: "checkout",
    });
    await expect(traceTool.execute(context, traceInput)).resolves.toMatchObject({
      traceId: traceInput.traceId,
    });
    expect(() => incidentTool.validate({ incidentId: "../invalid" })).toThrow();
  });

  it("validates bounded repository reads and searches", async () => {
    const fileTool = new ReadFileRangeToolV1(new StubFileSource());
    const searchTool = new SearchCodeToolV1(new StubCodeSource());
    const testTool = new FindTestsToolV1(new StubTestSource());

    await expect(
      fileTool.execute(
        context,
        fileTool.validate({ path: "src/parser.ts", startLine: 1, endLine: 5 }),
      ),
    ).resolves.toMatchObject({ content: "source" });
    await expect(
      searchTool.execute(context, searchTool.validate({ query: "parseInput" })),
    ).resolves.toHaveLength(1);
    await expect(
      testTool.execute(context, testTool.validate({ sourcePath: "src/parser.ts" })),
    ).resolves.toEqual(["src/parser.test.ts"]);
    expect(() =>
      fileTool.validate({ path: "src/parser.ts", startLine: 1, endLine: 501 }),
    ).toThrow();
  });

  it("validates and executes bounded recent Git history reads", async () => {
    const tool = new GetRecentChangesToolV1(new StubRecentChangesSource());

    await expect(
      tool.execute(context, tool.validate({ path: "src/parser.ts", maxCommits: 5 })),
    ).resolves.toEqual([
      expect.objectContaining({ commit: "abc123", subject: "Change src/parser.ts" }),
    ]);
    expect(() => tool.validate({ maxCommits: 51 })).toThrow();
  });
});

describe("workspace infrastructure", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  it("contains file access and executes fixed ripgrep searches", async () => {
    const root = await mkdtemp(join(tmpdir(), "sre-agent-tools-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "calculator.ts"),
      "export const add = (a: number, b: number) => a + b;\n",
    );
    await writeFile(join(root, "src", "calculator.test.ts"), "describe('add', () => {});\n");
    const outside = await mkdtemp(join(tmpdir(), "sre-agent-outside-"));
    temporaryRoots.push(outside);
    await writeFile(join(outside, "secret.txt"), "outside");

    const { CanonicalWorkspacePathPolicyV1 } = await import(
      "../src/infrastructure/workspace/canonical-workspace-path-policy-v1.js"
    );
    const { NodeWorkspaceFileSourceV1 } = await import(
      "../src/infrastructure/workspace/node-workspace-file-source-v1.js"
    );
    const { NodeReadOnlyProcessRunnerV1 } = await import(
      "../src/infrastructure/workspace/node-read-only-process-runner-v1.js"
    );
    const { RipgrepCodeSearchSourceV1 } = await import(
      "../src/infrastructure/workspace/ripgrep-code-search-source-v1.js"
    );
    const { RipgrepTestFileSourceV1 } = await import(
      "../src/infrastructure/workspace/ripgrep-test-file-source-v1.js"
    );
    const { GitRecentChangesSourceV1 } = await import(
      "../src/infrastructure/workspace/git-recent-changes-source-v1.js"
    );
    const paths = new CanonicalWorkspacePathPolicyV1(root);
    const processes = new NodeReadOnlyProcessRunnerV1();
    const options = { executable: "rg", timeoutMs: 5_000, maxOutputBytes: 100_000 };

    const files = new NodeWorkspaceFileSourceV1(paths, 100_000);
    await expect(files.readRange("src/calculator.ts", 1, 1)).resolves.toMatchObject({
      path: "src/calculator.ts",
      content: "export const add = (a: number, b: number) => a + b;",
    });
    await expect(
      paths.resolveExisting(join("..", outside.split(/[\\/]/).at(-1) ?? "")),
    ).rejects.toThrow(/escapes/);

    const search = new RipgrepCodeSearchSourceV1(paths, processes, options);
    await expect(
      search.search({
        query: "export const add",
        isRegex: false,
        caseSensitive: true,
        maxResults: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ path: "src/calculator.ts", line: 1, column: 1 }),
    ]);

    const tests = new RipgrepTestFileSourceV1(paths, processes, options);
    await expect(
      tests.findTests({ sourcePath: "src/calculator.ts", maxResults: 10 }),
    ).resolves.toEqual(["src/calculator.test.ts"]);

    const gitProcess = new StubProcessRunner();
    const history = new GitRecentChangesSourceV1(paths, gitProcess, {
      executable: "git",
      timeoutMs: 5_000,
      maxOutputBytes: 100_000,
    });
    await expect(
      history.getRecentChanges({ path: "src/calculator.ts", maxCommits: 5 }),
    ).resolves.toEqual([
      {
        commit: "abc123",
        author: "Developer",
        authoredAt: "2026-09-23T00:00:00Z",
        subject: "Fix parser",
      },
    ]);
    expect(gitProcess.request).toMatchObject({
      executable: "git",
      cwd: root,
      args: expect.arrayContaining(["log", "--max-count=5", "--", "src/calculator.ts"]),
    });
  });
});
