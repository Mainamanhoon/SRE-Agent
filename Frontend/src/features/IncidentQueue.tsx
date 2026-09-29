import { useEffect, useState } from "react";
import { ControlApiError, controlApi, type IncidentRecord } from "../api/control-api";

interface Props {
  onSelect: (incidentId: string) => void;
}

type LoadState = "loading" | "ready" | "empty" | "stale" | "error" | "unauthorized";

export function IncidentQueue({ onSelect }: Props) {
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    void reload;
    const controller = new AbortController();
    setState(incidents.length ? "stale" : "loading");
    setMessage("");
    controlApi
      .listIncidents(
        { status: status || undefined, service: service || undefined, limit: 50, cursor },
        controller.signal,
      )
      .then((page) => {
        setIncidents(page.items);
        setNextCursor(page.nextCursor);
        setState(page.items.length ? "ready" : "empty");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          incidents.length
            ? "stale"
            : error instanceof ControlApiError && (error.status === 401 || error.status === 403)
              ? "unauthorized"
              : "error",
        );
        setMessage(
          error instanceof ControlApiError && (error.status === 401 || error.status === 403)
            ? "Sign in through your organization’s access gateway to view incidents."
            : "The incident service could not be reached. Your last result is retained when available.",
        );
      });
    return () => controller.abort();
  }, [status, service, cursor, reload, incidents.length]);

  function resetPagination() {
    setCursors([undefined]);
  }

  return (
    <section className="console-panel" aria-labelledby="incident-queue-title">
      <div className="console-heading">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h2 id="incident-queue-title">Incident queue</h2>
          <p className="muted">
            Deduplicated production signals, ordered by most recently observed.
          </p>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh
        </button>
      </div>

      <fieldset className="filters">
        <legend className="sr-only">Incident filters</legend>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setIncidents([]);
              resetPagination();
            }}
          >
            <option value="">All statuses</option>
            {(
              [
                "open",
                "investigating",
                "repairing",
                "awaiting_review",
                "failed",
                "abstained",
                "resolved",
                "ignored",
              ] as const
            ).map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service
          <input
            value={service}
            maxLength={200}
            placeholder="All services"
            onChange={(event) => {
              setService(event.target.value);
              setIncidents([]);
              resetPagination();
            }}
          />
        </label>
      </fieldset>

      <div className="queue-state" role="status" aria-live="polite">
        {state === "loading" && <p>Loading incidents…</p>}
        {state === "empty" && <p>No incidents match these filters.</p>}
        {state === "unauthorized" && <p>{message}</p>}
        {state === "error" && <p>{message}</p>}
        {state === "stale" && (
          <p>
            {message
              ? `${message} Showing the last successful result.`
              : "Refreshing; showing the last successful result."}
          </p>
        )}
      </div>

      {incidents.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Incident</th>
                <th>Service</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Occurrences</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <button
                      className="table-link"
                      type="button"
                      onClick={() => onSelect(incident.id)}
                    >
                      {incident.errorSummary || incident.id}
                    </button>
                    <span className="row-subtitle">{incident.id}</span>
                  </td>
                  <td>
                    {incident.service}
                    <span className="row-subtitle">{incident.environment}</span>
                  </td>
                  <td>
                    <span className={`state-pill state-${incident.status}`}>
                      {incident.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{incident.severity}</td>
                  <td>{incident.occurrenceCount.toLocaleString()}</td>
                  <td>{formatDate(incident.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button
          className="quiet-button"
          type="button"
          disabled={cursors.length <= 1}
          onClick={() => setCursors((items) => items.slice(0, -1))}
        >
          Newer
        </button>
        <span>Page {cursors.length}</span>
        <button
          className="quiet-button"
          type="button"
          disabled={!nextCursor}
          onClick={() => {
            if (nextCursor) {
              setIncidents([]);
              setCursors((items) => [...items, nextCursor]);
            }
          }}
        >
          Older
        </button>
      </div>
    </section>
  );
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : date.toLocaleString();
}
