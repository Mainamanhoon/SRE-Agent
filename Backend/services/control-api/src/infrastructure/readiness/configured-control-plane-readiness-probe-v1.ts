import { connect } from "node:net";
import {
  ControlPlaneReadinessProbe,
  type ControlPlaneReadinessResult,
} from "../../application/contracts/control-plane-readiness-probe.js";

export interface ControlPlaneReadinessSettings {
  incidentDetectorUrl: string;
  incidentServiceUrl: string;
  agentRunnerUrl: string;
  temporalAddress: string;
  serviceToken: string;
  timeoutMs: number;
  requireAgentRunner: boolean;
}

export class ConfiguredControlPlaneReadinessProbeV1 extends ControlPlaneReadinessProbe {
  public constructor(private readonly settings: ControlPlaneReadinessSettings) {
    super();
  }

  public override async check(signal?: AbortSignal): Promise<ControlPlaneReadinessResult> {
    const probes = [
      this.httpCheck(
        "incidentDetector",
        new URL("/ready", this.settings.incidentDetectorUrl),
        signal,
      ),
      this.httpCheck(
        "incidentService",
        new URL("/ready", this.settings.incidentServiceUrl),
        signal,
      ),
      this.temporalCheck(),
    ];
    if (this.settings.requireAgentRunner) {
      probes.push(
        this.httpCheck(
          "agentRunner",
          new URL("/api/v1/health/ready", this.settings.agentRunnerUrl),
          signal,
        ),
      );
    }
    const entries = await Promise.all(probes);
    const checks = Object.fromEntries(entries);
    return { ready: entries.every(([, status]) => status === "ready"), checks };
  }

  private async httpCheck(
    name: string,
    url: URL,
    signal?: AbortSignal,
  ): Promise<[string, "ready" | "not_ready"]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(url, {
        headers: this.settings.serviceToken
          ? { authorization: `Bearer ${this.settings.serviceToken}` }
          : {},
        signal: controller.signal,
      });
      return [name, response.ok ? "ready" : "not_ready"];
    } catch {
      return [name, "not_ready"];
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private temporalCheck(): Promise<[string, "ready" | "not_ready"]> {
    const [host, portText] = this.settings.temporalAddress.split(":");
    const port = Number(portText);
    return new Promise((resolve) => {
      const socket = connect({ host, port });
      const finish = (status: "ready" | "not_ready") => {
        socket.destroy();
        resolve(["temporal", status]);
      };
      socket.setTimeout(this.settings.timeoutMs);
      socket.once("connect", () => finish("ready"));
      socket.once("timeout", () => finish("not_ready"));
      socket.once("error", () => finish("not_ready"));
    });
  }
}
