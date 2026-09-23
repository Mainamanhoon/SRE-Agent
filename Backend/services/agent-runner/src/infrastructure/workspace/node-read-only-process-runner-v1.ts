import { spawn } from "node:child_process";
import {
  type ReadOnlyProcessRequest,
  type ReadOnlyProcessResult,
  ReadOnlyProcessRunner,
} from "../../application/contracts/workspace-sources.js";

export class NodeReadOnlyProcessRunnerV1 extends ReadOnlyProcessRunner {
  public override run(request: ReadOnlyProcessRequest): Promise<ReadOnlyProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(request.executable, [...request.args], {
        cwd: request.cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;

      const finishWithError = (error: Error): void => {
        if (settled) return;
        settled = true;
        child.kill();
        cleanup();
        reject(error);
      };
      const collect = (target: Buffer[], chunk: Buffer): void => {
        outputBytes += chunk.byteLength;
        if (outputBytes > request.maxOutputBytes) {
          finishWithError(new Error(`process output exceeded ${request.maxOutputBytes} bytes`));
          return;
        }
        target.push(chunk);
      };
      const abort = () => finishWithError(new Error("read-only process was cancelled"));
      const timeout = setTimeout(
        () => finishWithError(new Error(`read-only process exceeded ${request.timeoutMs}ms`)),
        request.timeoutMs,
      );
      const cleanup = (): void => {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", abort);
      };

      request.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
      child.once("error", finishWithError);
      child.once("close", (exitCode) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });

      if (request.signal?.aborted) {
        abort();
      }
    });
  }
}
