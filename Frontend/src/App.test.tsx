import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const health = { status: "ok", service: "control-api", version: "test" };
const incident = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  fingerprint: "fingerprint-1",
  service: "checkout",
  environment: "production",
  severity: "high",
  status: "open",
  errorSummary: "TypeError: missing guard",
  occurrenceCount: 3,
  firstSeenAt: "2026-09-24T06:00:00Z",
  lastSeenAt: "2026-09-24T06:20:00Z",
};

function installFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)),
  );
}

describe("App", () => {
  it("renders the repair pipeline", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );

    render(<App />);

    expect(
      screen.getByRole("heading", { name: /production failure to verified fix/i }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Detect" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Handoff" })).toBeVisible();
  });

  it("shows a successful incident page", async () => {
    installFetch(async (url) =>
      url.endsWith("/health") ? response(health) : response({ items: [incident] }),
    );
    render(<App />);
    expect(await screen.findByRole("button", { name: "TypeError: missing guard" })).toBeVisible();
    expect(screen.getByText("checkout")).toBeVisible();
  });

  it("shows a clear empty state", async () => {
    installFetch(async (url) =>
      url.endsWith("/health") ? response(health) : response({ items: [] }),
    );
    render(<App />);
    expect(await screen.findByText("No incidents match these filters.")).toBeVisible();
  });

  it("shows unauthorized access without asking for an internal token", async () => {
    installFetch(async (url) =>
      url.endsWith("/health") ? response(health) : response({ code: "UNAUTHORIZED" }, 401),
    );
    render(<App />);
    expect(await screen.findByText(/sign in through your organization/i)).toBeVisible();
    expect(screen.queryByLabelText(/internal service token/i)).not.toBeInTheDocument();
  });

  it("keeps the last successful rows as stale when refresh fails", async () => {
    let listRequests = 0;
    installFetch(async (url) => {
      if (url.endsWith("/health")) return response(health);
      listRequests++;
      return listRequests === 1
        ? response({ items: [incident] })
        : response({ code: "DOWNSTREAM_UNAVAILABLE" }, 503);
    });
    render(<App />);
    expect(await screen.findByRole("button", { name: "TypeError: missing guard" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/last successful result/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "TypeError: missing guard" })).toBeVisible();
  });

  it("shows a bounded validation response when a repair request is rejected", async () => {
    installFetch(async (url, init) => {
      if (url.endsWith("/health")) return response(health);
      if (url.startsWith("/api/v1/incidents?")) return response({ items: [incident] });
      if (url.endsWith(`/api/v1/incidents/${incident.id}`)) return response(incident);
      if (url.endsWith("/actions"))
        return response({ incidentId: incident.id, currentStatus: "open", allowedActions: [] });
      if (url.endsWith("/occurrences")) return response({ items: [] });
      if (url.startsWith("/api/v1/repair-runs?")) return response({ items: [] });
      if (url.endsWith("/repairs") && init?.method === "POST")
        return response({ code: "INVALID_REPAIR_REQUEST" }, 400);
      return response({ code: "NOT_FOUND" }, 404);
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "TypeError: missing guard" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start a repair" }));
    fireEvent.change(screen.getByLabelText(/github installation id/i), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "example/service" } });
    fireEvent.change(screen.getByLabelText(/exact deployed commit/i), {
      target: { value: "abcdef1234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and start repair" }));
    expect(await screen.findByText(/request was rejected before a repair started/i)).toBeVisible();
  });
});
