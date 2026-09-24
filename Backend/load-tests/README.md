# Core-service load tests

The candidate test targets the stated 100,000 requests/minute objective: its default constant arrival rate is 1,667 requests/second for one minute. Run it against an isolated performance environment, not a developer database:

```powershell
k6 run Backend/load-tests/k6/control-plane.js
```

Configure `CONTROL_API_URL`, `CONTROL_API_TOKEN`, `REQUEST_RATE`, `DURATION`, `PREALLOCATED_VUS`, and `MAX_VUS` as needed. A valid run requires less than 1% failed requests, p95 below 500 ms, p99 below one second, and no dropped iterations.

Agent diagnoses are deliberately benchmarked separately because throughput is bounded by model-provider quotas and diagnosis duration rather than HTTP request capacity:

```powershell
$env:INTERNAL_SERVICE_TOKEN = "..."
k6 run Backend/load-tests/k6/agent-runner.js
```

Scale replicas and their per-instance limits before changing the arrival rate. The repository supplies the repeatable acceptance test; a measured 100,000 requests/minute result must be recorded from the target infrastructure because local Docker results do not establish production capacity.
