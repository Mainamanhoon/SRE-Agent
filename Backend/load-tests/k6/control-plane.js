import { check } from "k6";
import http from "k6/http";

const rate = Number(__ENV.REQUEST_RATE || 1667);
const duration = __ENV.DURATION || "1m";
const baseUrl = __ENV.CONTROL_API_URL || "http://localhost:4000";
const token = __ENV.CONTROL_API_TOKEN || "";

export const options = {
  scenarios: {
    candidates: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration,
      preAllocatedVUs: Number(__ENV.PREALLOCATED_VUS || 1000),
      maxVUs: Number(__ENV.MAX_VUS || 5000),
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    dropped_iterations: ["count==0"],
  },
};

export default function () {
  const sequence = `${__VU}-${__ITER}-${Date.now()}`;
  const response = http.post(
    `${baseUrl}/api/v1/incidents/candidates`,
    JSON.stringify({
      service: "load-test-checkout",
      environment: "performance",
      severity: "error",
      errorType: "SyntheticTimeout",
      errorMessage: `synthetic request ${sequence} timed out after 5000 ms`,
      topFrame: "checkout.ts:42",
      traceId: sequence,
    }),
    {
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      tags: { endpoint: "submit-candidate" },
    },
  );
  check(response, { "candidate accepted": (result) => result.status === 202 });
}
