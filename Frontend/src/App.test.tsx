import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
});
