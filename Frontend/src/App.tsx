import { useEffect, useState } from "react";
import { ControlApiError, controlApi } from "./api/control-api";
import { IncidentDetail } from "./features/IncidentDetail";
import { IncidentQueue } from "./features/IncidentQueue";
import { RepairRunDetail } from "./features/RepairRunDetail";

type HealthState =
  | { kind: "loading" }
  | { kind: "online"; service: string; version: string }
  | { kind: "unauthorized" }
  | { kind: "offline" };

type Page =
  | { kind: "queue" }
  | { kind: "incident"; incidentId: string }
  | { kind: "repair"; incidentId: string; repairRunId: string };

const pipeline = [
  ["01", "Detect", "OpenTelemetry signals become deduplicated incidents."],
  ["02", "Localize", "Trace frames resolve to the exact deployed revision."],
  ["03", "Repair", "A bounded agent works inside an isolated checkout."],
  ["04", "Verify", "Regression tests and policy gates assess the patch."],
  ["05", "Handoff", "A GitHub App opens an evidence-rich draft PR."],
] as const;

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [page, setPage] = useState<Page>({ kind: "queue" });

  useEffect(() => {
    const controller = new AbortController();
    controlApi
      .health(controller.signal)
      .then((result) =>
        setHealth({ kind: "online", service: result.service, version: result.version }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth(
          error instanceof ControlApiError && (error.status === 401 || error.status === 403)
            ? { kind: "unauthorized" }
            : { kind: "offline" },
        );
      });
    return () => controller.abort();
  }, []);

  const statusLabel =
    health.kind === "loading"
      ? "Connecting"
      : health.kind === "online"
        ? "Online"
        : health.kind === "unauthorized"
          ? "Access required"
          : "Offline";
  const healthService = health.kind === "online" ? health.service : "Control API";
  const healthVersion = health.kind === "online" ? health.version : "—";

  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <button
          className="brand brand-button"
          type="button"
          onClick={() => setPage({ kind: "queue" })}
        >
          <span className="brand-mark">SRE</span>
          <span>Agent Console</span>
        </button>
        <div className="nav-links">
          <button type="button" onClick={() => setPage({ kind: "queue" })}>
            Incidents
          </button>
          <a href="#pipeline">Pipeline</a>
        </div>
      </nav>

      <section className="hero console-hero" id="top">
        <div>
          <p className="eyebrow">AUTONOMOUS INCIDENT RESPONSE</p>
          <h1>From production failure to verified fix.</h1>
          <p className="lede">
            Correlate telemetry, inspect the deployed code, reproduce the fault, and prepare a
            reviewable pull request with a durable evidence trail.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => setPage({ kind: "queue" })}
            >
              Open incident queue
            </button>
            <span className={`status status-${health.kind}`}>
              <span className="status-dot" aria-hidden="true" />
              Backend {statusLabel}
            </span>
          </div>
        </div>
        <aside className="signal-card" aria-label="System status">
          <div className="signal-card-header">
            <span>CONTROL PLANE</span>
            <span>{statusLabel.toUpperCase()}</span>
          </div>
          <dl>
            <div>
              <dt>Service</dt>
              <dd>{healthService}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{healthVersion}</dd>
            </div>
            <div>
              <dt>Autonomy</dt>
              <dd>L2 · Draft PR</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="workspace-section" aria-label="Incident operations">
        {page.kind === "queue" && (
          <IncidentQueue onSelect={(incidentId) => setPage({ kind: "incident", incidentId })} />
        )}
        {page.kind === "incident" && (
          <IncidentDetail
            incidentId={page.incidentId}
            onBack={() => setPage({ kind: "queue" })}
            onRepairRun={(repairRunId) =>
              setPage({ kind: "repair", incidentId: page.incidentId, repairRunId })
            }
          />
        )}
        {page.kind === "repair" && (
          <RepairRunDetail
            repairRunId={page.repairRunId}
            onBack={() => setPage({ kind: "incident", incidentId: page.incidentId })}
          />
        )}
        {health.kind === "unauthorized" && (
          <p className="auth-notice" role="status">
            Access is mediated by your organization’s sign-in gateway. No service credential is
            stored in this browser.
          </p>
        )}
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
