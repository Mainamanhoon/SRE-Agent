import { useEffect, useState } from "react";

type HealthState =
  | { kind: "loading" }
  | { kind: "online"; service: string; version: string }
  | { kind: "offline" };

const pipeline = [
  ["01", "Detect", "OpenTelemetry signals become deduplicated incidents."],
  ["02", "Localize", "Trace frames resolve to the exact deployed revision."],
  ["03", "Repair", "A bounded agent works inside an isolated checkout."],
  ["04", "Verify", "Regression tests and policy gates assess the patch."],
  ["05", "Handoff", "A GitHub App opens an evidence-rich draft PR."],
] as const;

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Backend is unavailable");
        return response.json() as Promise<{ service: string; version: string }>;
      })
      .then((result) => {
        setHealth({ kind: "online", service: result.service, version: result.version });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHealth({ kind: "offline" });
      });

    return () => controller.abort();
  }, []);

  const statusLabel =
    health.kind === "loading" ? "Connecting" : health.kind === "online" ? "Online" : "Offline";

  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top">
          <span className="brand-mark">SRE</span>
          <span>Agent Console</span>
        </a>
        <a href="#pipeline">Pipeline</a>
      </nav>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">AUTONOMOUS INCIDENT RESPONSE</p>
          <h1>From production failure to verified fix.</h1>
          <p className="lede">
            Correlate telemetry, inspect the deployed code, reproduce the fault, and prepare a
            reviewable pull request with an evidence trail.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#pipeline">
              Explore the pipeline
            </a>
            <span className={`status status-${health.kind}`}>
              <span className="status-dot" aria-hidden="true" />
              Backend {statusLabel}
            </span>
          </div>
        </div>

        <aside className="signal-card" aria-label="System status">
          <div className="signal-card-header">
            <span>CONTROL PLANE</span>
            <span>FOUNDATION</span>
          </div>
          <dl>
            <div>
              <dt>Service</dt>
              <dd>{health.kind === "online" ? health.service : "sre-agent-backend"}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{health.kind === "online" ? health.version : "local"}</dd>
            </div>
            <div>
              <dt>Autonomy</dt>
              <dd>L2 · Draft PR</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="pipeline-section" id="pipeline">
        <div className="section-heading">
          <p className="eyebrow">REPAIR WORKFLOW</p>
          <h2>One bounded path from signal to handoff</h2>
        </div>
        <div className="pipeline-grid">
          {pipeline.map(([number, title, description]) => (
            <article className="pipeline-card" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
