import { check } from "k6";
import http from "k6/http";

const baseUrl = __ENV.AGENT_RUNNER_URL || "http://localhost:4040";
const token = __ENV.INTERNAL_SERVICE_TOKEN || "";

export const options = {
  scenarios: {
    diagnoses: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 5),
      duration: __ENV.DURATION || "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<900000"],
  },
};

export default function () {
  const repairRunId = `load-${__VU}-${__ITER}-${Date.now()}`;
  const response = http.post(
    `${baseUrl}/api/v1/diagnoses`,
    JSON.stringify({
      repairRunId,
      incident: { id: repairRunId, service: "load-test" },
      evidence: [],
    }),
    {
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      timeout: "16m",
      tags: { endpoint: "diagnose" },
    },
  );
  check(response, {
    "diagnosis completed or admission bounded": (result) =>
      result.status === 200 || result.status === 429,
  });
}
