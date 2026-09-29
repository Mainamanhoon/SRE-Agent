import {
  type SourceArchive,
  SourceArchiveProvider,
} from "../../application/contracts/diagnostic-workspace-provider.js";

export interface HttpSourceArchiveProviderSettings {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  maxArchiveBytes: number;
}

export class HttpSourceArchiveProviderV1 extends SourceArchiveProvider {
  public constructor(private readonly settings: HttpSourceArchiveProviderSettings) {
    super();
  }

  public override async fetch(request: {
    installationId: number;
    repository: string;
    expectedCommit: string;
  }): Promise<SourceArchive> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("source archive timeout")),
      this.settings.timeoutMs,
    );
    try {
      const url = new URL("/api/v1/source-archives", this.settings.baseUrl);
      url.searchParams.set("installationId", String(request.installationId));
      url.searchParams.set("repository", request.repository);
      url.searchParams.set("ref", request.expectedCommit);
      const response = await fetch(url, {
        headers: {
          accept: "application/gzip",
          authorization: `Bearer ${this.settings.serviceToken}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`source archive provider returned HTTP ${response.status}`);
      const resolvedCommit = response.headers.get("x-resolved-commit") ?? "";
      if (!resolvedCommit)
        throw new Error("source archive response did not prove its resolved commit");
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > this.settings.maxArchiveBytes)
        throw new Error("source archive exceeds configured size limit");
      return { resolvedCommit, body };
    } finally {
      clearTimeout(timeout);
    }
  }
}
