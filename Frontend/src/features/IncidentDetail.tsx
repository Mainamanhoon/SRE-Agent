import { type FormEvent, useEffect, useState } from "react";
import {
  ControlApiError,
  controlApi,
  type IncidentActions,
  type IncidentOccurrence,
  type IncidentRecord,
  type OccurrencePage,
  type RepairRunRecord,
  type StartRepairCommand,
} from "../api/control-api";
import { formatDate } from "./IncidentQueue";

interface Props {
  incidentId: string;
  onBack: () => void;
  onRepairRun: (repairRunId: string) => void;
}

type ReadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string; unauthorized?: boolean };

export function IncidentDetail({ incidentId, onBack, onRepairRun }: Props) {
  const [incident, setIncident] = useState<ReadState<IncidentRecord>>({ kind: "loading" });
  const [actions, setActions] = useState<IncidentActions>();
  const [occurrences, setOccurrences] = useState<OccurrencePage>();
  const [runs, setRuns] = useState<RepairRunRecord[]>([]);
  const [runCursor, setRunCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [olderBusy, setOlderBusy] = useState(false);
  const [transition, setTransition] = useState("");
  const [actionError, setActionError] = useState("");
  const [showRepairDialog, setShowRepairDialog] = useState(false);

  useEffect(() => {
    void refresh;
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      controlApi.getIncident(incidentId, controller.signal),
      controlApi.getIncidentActions(incidentId, controller.signal),
    ])
      .then(([record, allowed]) => {
        setIncident({ kind: "ready", value: record });
        setActions(allowed);
        setActionError("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const unauthorized =
          error instanceof ControlApiError && (error.status === 401 || error.status === 403);
        setIncident({
          kind: "error",
          unauthorized,
          message: unauthorized
            ? "Your account cannot view this incident."
            : "Incident details are temporarily unavailable.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [incidentId, refresh]);

  useEffect(() => {
    void refresh;
    const controller = new AbortController();
    controlApi
      .listOccurrences(incidentId, 25, undefined, controller.signal)
      .then(setOccurrences)
      .catch(() => {
        if (!controller.signal.aborted)
          setActionError("Occurrence history is temporarily unavailable.");
      });
    return () => controller.abort();
  }, [incidentId, refresh]);

  useEffect(() => {
    void refresh;
    const controller = new AbortController();
    controlApi
      .listRepairRuns(incidentId, undefined, controller.signal)
      .then((page) => {
        setRuns(page.items);
        setRunCursor(page.nextCursor);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setActionError("Related repair runs are temporarily unavailable.");
      });
    return () => controller.abort();
  }, [incidentId, refresh]);

  async function loadOlderOccurrences() {
    if (!occurrences?.nextCursor || olderBusy) return;
    setOlderBusy(true);
    try {
      const older = await controlApi.listOccurrences(incidentId, 25, occurrences.nextCursor);
      setOccurrences({
        items: [...occurrences.items, ...older.items],
        nextCursor: older.nextCursor,
      });
    } catch {
      setActionError("Could not load older occurrence history.");
    } finally {
      setOlderBusy(false);
    }
  }

  async function loadMoreRuns() {
    if (!runCursor) return;
    try {
      const page = await controlApi.listRepairRuns(incidentId, runCursor);
      setRuns((items) => [...items, ...page.items]);
      setRunCursor(page.nextCursor);
    } catch {
      setActionError("Could not load more repair runs.");
    }
  }

  async function updateStatus(status: string) {
    if (!incidentId || transition) return;
    setTransition(status);
    setActionError("");
    try {
      await controlApi.updateIncidentStatus(incidentId, status);
      setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(
        error instanceof ControlApiError && error.status === 409
          ? "The incident changed while you were viewing it. Refresh and try again."
          : "The lifecycle update failed; no state change was assumed.",
      );
    } finally {
      setTransition("");
    }
  }

  return (
    <section className="console-panel detail-panel" aria-labelledby="incident-detail-title">
      <div className="console-heading">
        <div>
          <button className="back-link" type="button" onClick={onBack}>
            ← Incident queue
          </button>
          <p className="eyebrow">INCIDENT DETAIL</p>
          <h2 id="incident-detail-title">
            {incident.kind === "ready" ? incident.value.service : "Incident"}
          </h2>
          <code className="record-id">{incidentId}</code>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && incident.kind === "loading" && (
        <p className="inline-state" role="status">
          Loading incident details…
        </p>
      )}
      {incident.kind === "error" && (
        <p className="inline-state error-state" role="alert">
          {incident.message}
        </p>
      )}

      {incident.kind === "ready" && (
        <>
          <div className="detail-grid">
            <article className="detail-card">
              <h3>Lifecycle</h3>
              <p>
                <span className={`state-pill state-${incident.value.status}`}>
                  {incident.value.status.replaceAll("_", " ")}
                </span>
              </p>
              <dl className="facts">
                <div>
                  <dt>Severity</dt>
                  <dd>{incident.value.severity}</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{incident.value.environment}</dd>
                </div>
                <div>
                  <dt>Occurrences</dt>
                  <dd>{incident.value.occurrenceCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>First seen</dt>
                  <dd>{formatDate(incident.value.firstSeenAt)}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{formatDate(incident.value.lastSeenAt)}</dd>
                </div>
                {incident.value.traceId && (
                  <div>
                    <dt>Trace ID</dt>
                    <dd>
                      <code>{incident.value.traceId}</code>
                    </dd>
                  </div>
                )}
              </dl>
              {actions?.allowedActions.length ? (
                <fieldset className="action-row action-fieldset">
                  <legend className="sr-only">Allowed lifecycle actions</legend>
                  {actions.allowedActions.map((nextStatus) => (
                    <button
                      className="quiet-button"
                      key={nextStatus}
                      type="button"
                      disabled={!!transition}
                      onClick={() => void updateStatus(nextStatus)}
                    >
                      {transition === nextStatus
                        ? "Updating…"
                        : `Move to ${nextStatus.replaceAll("_", " ")}`}
                    </button>
                  ))}
                </fieldset>
              ) : (
                <p className="muted">No lifecycle actions are currently allowed.</p>
              )}
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowRepairDialog(true)}
              >
                Start a repair
              </button>
            </article>

            <article className="detail-card evidence-card">
              <h3>Signal summary</h3>
              <p>{incident.value.errorSummary || "No normalized error summary was recorded."}</p>
              <dl className="facts">
                <div>
                  <dt>Fingerprint</dt>
                  <dd>
                    <code>{incident.value.fingerprint}</code>
                  </dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{incident.value.service}</dd>
                </div>
              </dl>
            </article>
          </div>

          {actionError && (
            <p className="inline-state error-state" role="alert">
              {actionError}
            </p>
          )}

          <section className="subsection" aria-labelledby="occurrence-title">
            <div className="subsection-heading">
              <h3 id="occurrence-title">Occurrence timeline</h3>
              <span>{occurrences?.items.length ?? 0} loaded</span>
            </div>
            {!occurrences && (
              <p className="inline-state" role="status">
                Loading occurrences…
              </p>
            )}
            {occurrences?.items.length === 0 && (
              <p className="muted">No occurrence records are available.</p>
            )}
            {!!occurrences?.items.length && (
              <ol className="timeline">
                {occurrences.items.map((item: IncidentOccurrence) => (
                  <li key={item.id}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <div>
                      <strong>{item.severity} signal</strong>
                      <time>{formatDate(item.observedAt)}</time>
                      <p>{item.errorSummary || "Occurrence recorded."}</p>
                      {item.traceId && <code>Trace {item.traceId}</code>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {occurrences?.nextCursor && (
              <button
                className="quiet-button"
                type="button"
                disabled={olderBusy}
                onClick={() => void loadOlderOccurrences()}
              >
                {olderBusy ? "Loading…" : "Load older occurrences"}
              </button>
            )}
          </section>

          <section className="subsection" aria-labelledby="repairs-title">
            <div className="subsection-heading">
              <h3 id="repairs-title">Related repair runs</h3>
              <span>{runs.length} loaded</span>
            </div>
            {runs.length === 0 && (
              <p className="muted">No repair runs have been started for this incident.</p>
            )}
            <ul className="run-list">
              {runs.map((run) => (
                <li key={run.id}>
                  <button className="table-link" type="button" onClick={() => onRepairRun(run.id)}>
                    {run.id}
                  </button>
                  <span className={`state-pill state-${run.status}`}>
                    {run.status.replaceAll("_", " ")}
                  </span>
                  <span>
                    {run.repositoryOwner}/{run.repositoryName}
                  </span>
                  <span>{formatDate(run.startedAt)}</span>
                </li>
              ))}
            </ul>
            {runCursor && (
              <button className="quiet-button" type="button" onClick={() => void loadMoreRuns()}>
                Load more repair runs
              </button>
            )}
          </section>
        </>
      )}

      {showRepairDialog && incident.kind === "ready" && (
        <RepairStartDialog
          incident={incident.value}
          occurrences={occurrences?.items ?? []}
          onClose={() => setShowRepairDialog(false)}
          onStarted={(runId) => onRepairRun(runId)}
        />
      )}
    </section>
  );
}

interface RepairDialogProps {
  incident: IncidentRecord;
  occurrences: IncidentOccurrence[];
  onClose: () => void;
  onStarted: (repairRunId: string) => void;
}

function RepairStartDialog({ incident, occurrences, onClose, onStarted }: RepairDialogProps) {
  const [repairRunId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const installationId = Number(form.get("installationId"));
    const repository = String(form.get("repository") ?? "").trim();
    const deployedCommit = String(form.get("deployedCommit") ?? "").trim();
    const baseBranch = String(form.get("baseBranch") ?? "").trim();
    const toolchain = String(form.get("toolchain")) as "node" | "go";
    const command: StartRepairCommand = {
      incidentId: incident.id,
      fingerprint: incident.fingerprint,
      repairRunId,
      installationId,
      repository,
      deployedCommit,
      baseBranch,
      toolchain,
      incident: {
        id: incident.id,
        serviceName: incident.service,
        environment: incident.environment,
        exceptionType: "ObservedProductionError",
        exceptionMessage: incident.errorSummary || "Production incident requires investigation.",
        traceId: incident.traceId,
        deployedRevision: deployedCommit,
      },
      evidence: occurrences.map((item) => ({
        id: String(item.id),
        kind: "exception",
        summary: item.errorSummary || incident.errorSummary || "Observed exception",
      })),
    };
    setBusy(true);
    setError("");
    try {
      await controlApi.startRepair(command);
      onStarted(repairRunId);
    } catch (cause) {
      setError(
        cause instanceof ControlApiError && cause.status === 400
          ? "Review the repository, commit, installation, and toolchain values. The request was rejected before a repair started."
          : cause instanceof ControlApiError && (cause.status === 401 || cause.status === 403)
            ? "You are not authorized to start repairs."
            : "Repair start could not be confirmed. Retry to safely reuse the same repair ID.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="repair-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-repair-title"
      >
        <div className="console-heading">
          <div>
            <p className="eyebrow">EXPLICIT APPROVAL</p>
            <h2 id="start-repair-title">Start a bounded repair</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close repair dialog"
          >
            ×
          </button>
        </div>
        <p className="muted">
          The agent will inspect the exact commit, verify changes in an isolated sandbox, and only
          prepare a draft pull request.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            GitHub installation ID
            <input name="installationId" type="number" min="1" step="1" required />
          </label>
          <label>
            Repository
            <input
              name="repository"
              placeholder="owner/repository"
              pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
              required
            />
          </label>
          <label>
            Exact deployed commit
            <input
              name="deployedCommit"
              placeholder="40-character commit SHA"
              pattern="[a-fA-F0-9]{7,64}"
              required
            />
          </label>
          <div className="form-columns">
            <label>
              Base branch
              <input name="baseBranch" defaultValue="main" maxLength={200} required />
            </label>
            <label>
              Toolchain
              <select name="toolchain" defaultValue="node">
                <option value="node">Node.js</option>
                <option value="go">Go</option>
              </select>
            </label>
          </div>
          <p className="idempotency-note">
            Repair ID: <code>{repairRunId}</code>. Retries reuse this identifier.
          </p>
          {error && (
            <p className="inline-state error-state" role="alert">
              {error}
            </p>
          )}
          <div className="action-row">
            <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Starting…" : "Confirm and start repair"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
