import { describe, expect, it } from "vitest";
import { Clock } from "../src/application/contracts/clock.js";
import { ControlApiQueryServiceV1 } from "../src/application/implementations/control-api-query-service-v1.js";

class FixedClock extends Clock {
  public override now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

describe("ControlApiQueryServiceV1", () => {
  it("uses the injected clock and settings", () => {
    const service = new ControlApiQueryServiceV1(
      {
        serviceName: "control-api",
        serviceVersion: "test",
        environment: "test",
        incidentDetectorUrl: "http://detector.test",
        incidentServiceUrl: "http://incidents.test",
        temporalAddress: "temporal.test:7233",
      },
      new FixedClock(),
    );

    expect(service.getHealth().timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(service.getSystem().services.incidentDetector).toBe("http://detector.test");
  });
});
