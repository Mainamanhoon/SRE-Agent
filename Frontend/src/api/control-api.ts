export interface IncidentRecord {
  id: string;
  fingerprint: string;
  service: string;
  environment: string;
  severity: string;
  status: string;
  traceId?: string;
  errorSummary?: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface IncidentPage {
  items: IncidentRecord[];
  nextCursor?: string;
}

export interface IncidentOccurrence {
  id: number;
  incidentId: string;
  severity: string;
  traceId?: string;
  errorSummary?: string;
  observedAt: string;
}

export interface OccurrencePage {
  items: IncidentOccurrence[];
  nextCursor?: string;
}

export interface IncidentActions {
  incidentId: string;
  currentStatus: string;
  allowedActions: string[];
}

export interface RepairRunRecord {
  id: string;
  incidentId: string;
  repositoryOwner: string;
  repositoryName: string;
  expectedCommit: string;
  toolchain: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  diagnosisSummary?: string;
  abstentionReason?: string;
  failureCode?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  verificationSummary?: string;
  harness?: string;
  model?: string;
  policyVersion?: string;
}

export interface RepairRunEvent {
  id: number;
  repairRunId: string;
  eventType: string;
  stage: string;
  outcome: string;
  status?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface RepairRunPage {
  items: RepairRunRecord[];
  nextCursor?: string;
}

export interface RepairRunEventPage {
  items: RepairRunEvent[];
  nextCursor?: number;
}

export interface StartRepairCommand {
  incidentId: string;
  fingerprint: string;
  repairRunId: string;
  installationId: number;
  repository: string;
  deployedCommit: string;
  baseBranch: string;
  toolchain: "node" | "go";
  incident: {
    id: string;
    serviceName: string;
    environment: string;
    exceptionType: string;
    exceptionMessage: string;
    traceId?: string;
    deployedRevision: string;
  };
  evidence: Array<{
    id: string;
    kind: "exception";
    summary: string;
    uri?: string;
  }>;
}

export class ControlApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "ControlApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : `HTTP_${response.status}`;
    throw new ControlApiError(response.status, code);
  }
  return payload as T;
}

export const controlApi = {
  health: (signal?: AbortSignal) =>
    request<{ status: string; service: string; version: string }>("/health", { signal }),
  listIncidents: (
    query: { status?: string; service?: string; limit?: number; cursor?: string },
    signal?: AbortSignal,
    cache?: RequestCache,
  ) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== "") params.set(key, String(value));
    return request<IncidentPage>(`/incidents?${params.toString()}`, { signal, cache });
  },
  getIncident: (id: string, signal?: AbortSignal, cache?: RequestCache) =>
    request<IncidentRecord>(`/incidents/${encodeURIComponent(id)}`, { signal, cache }),
  listOccurrences: (
    id: string,
    limit: number,
    cursor?: string,
    signal?: AbortSignal,
    cache?: RequestCache,
  ) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request<OccurrencePage>(`/incidents/${encodeURIComponent(id)}/occurrences?${params}`, {
      signal,
      cache,
    });
  },
  getIncidentActions: (id: string, signal?: AbortSignal, cache?: RequestCache) =>
    request<IncidentActions>(`/incidents/${encodeURIComponent(id)}/actions`, { signal, cache }),
  updateIncidentStatus: (id: string, status: string, signal?: AbortSignal) =>
    request<IncidentRecord>(`/incidents/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
      signal,
    }),
  listRepairRuns: (
    incidentId: string,
    cursor?: string,
    signal?: AbortSignal,
    cache?: RequestCache,
  ) => {
    const params = new URLSearchParams({ incidentId, limit: "50" });
    if (cursor) params.set("cursor", cursor);
    return request<RepairRunPage>(`/repair-runs?${params}`, { signal, cache });
  },
  getRepairRun: (id: string, signal?: AbortSignal) =>
    request<RepairRunRecord>(`/repair-runs/${encodeURIComponent(id)}`, { signal }),
  listRepairRunEvents: (id: string, afterId = 0, signal?: AbortSignal) =>
    request<RepairRunEventPage>(
      `/repair-runs/${encodeURIComponent(id)}/events?afterId=${afterId}&limit=100`,
      { signal },
    ),
  startRepair: (command: StartRepairCommand, signal?: AbortSignal) =>
    request<{ workflowId: string; runId: string; status: string }>("/repairs", {
      method: "POST",
      body: JSON.stringify(command),
      signal,
    }),
};
