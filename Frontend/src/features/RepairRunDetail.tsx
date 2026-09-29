import { useEffect, useState } from "react";
import {
  ControlApiError,
  controlApi,
  type RepairRunEvent,
  type RepairRunRecord,
} from "../api/control-api";
import { formatDate } from "./IncidentQueue";

interface Props {
  repairRunId: string;
  onBack: () => void;
}

export function RepairRunDetail({ repairRunId, onBack }: Props) {
  const [run, setRun] = useState<RepairRunRecord>();
  const [events, setEvents] = useState<RepairRunEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      controlApi.getRepairRun(repairRunId, controller.signal),
      controlApi.listRepairRunEvents(repairRunId, 0, controller.signal),
    ])
      .then(([record, page]) => {
        setRun(record);
        setEvents(page.items);
        setCursor(page.nextCursor ?? 0);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof ControlApiError && cause.status === 401
              ? "Sign in through your organization’s access gateway to view this repair."
              : "The repair run is unavailable. Refresh or return to its incident.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [repairRunId]);

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await controlApi.listRepairRunEvents(repairRunId, cursor);
      setEvents((items) => [...items, ...page.items]);
      setCursor(page.nextCursor ?? 0);
    } catch {
      setError("Could not load older repair events.");
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <section className="console-panel detail-panel" aria-labelledby="repair-run-title">
      <div className="console-heading">
        <div>
          <button className="back-link" type="button" onClick={onBack}>
            ← Back to incident
          </button>
          <p className="eyebrow">REPAIR RUN</p>
          <h2 id="repair-run-title">{repairRunId}</h2>
        </div>
        {run && (
          <span className={`state-pill state-${run.status}`}>
            {run.status.replaceAll("_", " ")}
          </span>
        )}
      </div>
      {loading && (
        <p className="inline-state" role="status">
          Loading repair history…
        </p>
      )}
      {error && (
        <p className="inline-state error-state" role="alert">
          {error}
        </p>
      )}
      {run && (
        <>
          <div className="detail-grid">
            <article className="detail-card">
              <h3>Execution</h3>
              <dl className="facts">
                <div>
                  <dt>Repository</dt>
                  <dd>
                    {run.repositoryOwner}/{run.repositoryName}
                  </dd>
                </div>
                <div>
                  <dt>Expected commit</dt>
                  <dd>
                    <code>{run.expectedCommit}</code>
                  </dd>
                </div>
                <div>
                  <dt>Toolchain</dt>
                  <dd>{run.toolchain}</dd>
                </div>
                <div>
                  <dt>Harness</dt>
                  <dd>{run.harness || "Not reported"}</dd>
                </div>
                <div>
                  <dt>Provider model</dt>
                  <dd>{run.model || "Not reported"}</dd>
                </div>
                <div>
                  <dt>Policy</dt>
                  <dd>{run.policyVersion || "Not reported"}</dd>
                </div>
              </dl>
            </article>
            <article className="detail-card">
              <h3>Outcome</h3>
              {run.diagnosisSummary && <p>{run.diagnosisSummary}</p>}
              {run.abstentionReason && <p className="callout">Abstained: {run.abstentionReason}</p>}
              {run.failureCode && (
                <p className="callout">
                  Failure code: <code>{run.failureCode}</code>
                </p>
              )}
              {run.verificationSummary && <p>Verification: {run.verificationSummary}</p>}
              {run.pullRequestUrl && (
                <p>
                  <a
                    className="external-link"
                    href={run.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Draft pull request #{run.pullRequestNumber ?? "view"} ↗
                  </a>
                </p>
              )}
              {!run.diagnosisSummary &&
                !run.abstentionReason &&
                !run.failureCode &&
                !run.verificationSummary &&
                !run.pullRequestUrl && (
                  <p className="muted">Outcome details will appear as the workflow progresses.</p>
                )}
            </article>
          </div>

          <section className="subsection" aria-labelledby="run-timeline-title">
            <div className="subsection-heading">
              <h3 id="run-timeline-title">Stage timeline</h3>
              <span>{events.length} events</span>
            </div>
            {events.length === 0 && !loading && (
              <p className="muted">No run events have been recorded yet.</p>
            )}
            <ol className="timeline run-timeline">
              {events.map((event) => (
                <RepairEvent key={event.id} event={event} />
              ))}
            </ol>
            {cursor > 0 && (
              <button
                className="quiet-button"
                type="button"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
              >
                {loadingOlder ? "Loading…" : "Load older events"}
              </button>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function RepairEvent({ event }: { event: RepairRunEvent }) {
  const summary = typeof event.metadata.summary === "string" ? event.metadata.summary : "";
  const changedPaths = Array.isArray(event.metadata.changedPaths)
    ? event.metadata.changedPaths.filter((path): path is string => typeof path === "string")
    : [];
  const checkNames = Array.isArray(event.metadata.checkNames)
    ? event.metadata.checkNames.filter((name): name is string => typeof name === "string")
    : [];
  return (
    <li>
      <span className="timeline-dot" aria-hidden="true" />
      <div>
        <strong>{event.eventType.replaceAll("_", " ")}</strong>
        <time>{formatDate(event.occurredAt)}</time>
        <p>
          {event.stage} · {event.outcome}
          {event.status ? ` · ${event.status.replaceAll("_", " ")}` : ""}
        </p>
        {summary && <p>{summary}</p>}
        {!!changedPaths.length && <p>Proposed paths: {changedPaths.join(", ")}</p>}
        {!!checkNames.length && <p>Checks: {checkNames.join(", ")}</p>}
        {typeof event.metadata.reviewState === "string" && (
          <p>Review: {event.metadata.reviewState.replaceAll("_", " ")}</p>
        )}
      </div>
    </li>
  );
}
