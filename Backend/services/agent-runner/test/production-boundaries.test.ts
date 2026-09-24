import { describe, expect, it } from "vitest";
import {
  DiagnosisAdmissionRejectedError,
  DiagnosisTimeoutError,
} from "../src/application/contracts/diagnosis-admission-controller.js";
import { BearerTokenRequestAuthenticatorV1 } from "../src/application/implementations/bearer-token-request-authenticator-v1.js";
import { BoundedDiagnosisAdmissionControllerV1 } from "../src/application/implementations/bounded-diagnosis-admission-controller-v1.js";
import { loadConfig } from "../src/config.js";

describe("agent production boundaries", () => {
  it("uses constant-time bearer-token authentication semantics", () => {
    const authenticator = new BearerTokenRequestAuthenticatorV1(true, "a".repeat(32));

    expect(authenticator.authenticate(`Bearer ${"a".repeat(32)}`)).toBe(true);
    expect(authenticator.authenticate(`Bearer ${"b".repeat(32)}`)).toBe(false);
    expect(authenticator.authenticate()).toBe(false);
    expect(new BearerTokenRequestAuthenticatorV1(false, "").authenticate()).toBe(true);
  });

  it("bounds concurrent and queued diagnosis work", async () => {
    const admission = new BoundedDiagnosisAdmissionControllerV1(1, 1, 5_000);
    let releaseFirst: (() => void) | undefined;
    const first = admission.run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const second = admission.run(async () => undefined);

    await expect(admission.run(async () => undefined)).rejects.toBeInstanceOf(
      DiagnosisAdmissionRejectedError,
    );
    expect(admission.snapshot()).toEqual({ active: 1, queued: 1, capacity: 1 });
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(admission.snapshot()).toEqual({ active: 0, queued: 0, capacity: 1 });
  });

  it("cancels diagnoses that exceed their deadline", async () => {
    const admission = new BoundedDiagnosisAdmissionControllerV1(1, 0, 5);

    await expect(
      admission.run(
        (signal) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason)),
          ),
      ),
    ).rejects.toBeInstanceOf(DiagnosisTimeoutError);
  });

  it("removes disconnected callers from the admission queue", async () => {
    const admission = new BoundedDiagnosisAdmissionControllerV1(1, 1, 5_000);
    let releaseFirst: (() => void) | undefined;
    const first = admission.run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const caller = new AbortController();
    const queued = admission.run(async () => undefined, caller.signal);
    caller.abort(new Error("disconnected"));

    await expect(queued).rejects.toThrow("disconnected");
    expect(admission.snapshot().queued).toBe(0);
    releaseFirst?.();
    await first;
  });

  it("rejects unsafe production configuration", () => {
    expect(() => loadConfig({ NODE_ENV: "production", AGENT_HARNESS: "fake" })).toThrow(
      /fake harness/,
    );
    expect(() => loadConfig({ NODE_ENV: "production", AGENT_HARNESS: "deepseek" })).toThrow(
      /authentication/,
    );
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AGENT_HARNESS: "deepseek",
        API_AUTH_ENABLED: "true",
        API_AUTH_TOKEN: "short",
      }),
    ).toThrow(/32 characters/);
  });
});
