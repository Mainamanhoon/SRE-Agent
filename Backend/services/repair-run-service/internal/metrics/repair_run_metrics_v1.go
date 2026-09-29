package metrics

import (
	"fmt"
	"sync/atomic"

	"github.com/sre-agent/repair-run-service/internal/application"
)

var _ application.RepairRunMetrics = (*RepairRunMetricsV1)(nil)

type RepairRunMetricsV1 struct{ created, read, event, updated, rejected, failed atomic.Uint64 }

func (metrics *RepairRunMetricsV1) Observe(outcome string) {
	switch outcome {
	case "created":
		metrics.created.Add(1)
	case "read":
		metrics.read.Add(1)
	case "event":
		metrics.event.Add(1)
	case "updated":
		metrics.updated.Add(1)
	case "rejected":
		metrics.rejected.Add(1)
	default:
		metrics.failed.Add(1)
	}
}

func (metrics *RepairRunMetricsV1) Prometheus() string {
	return fmt.Sprintf(`# HELP sre_repair_run_service_operations_total Repair run service operations by outcome.
# TYPE sre_repair_run_service_operations_total counter
sre_repair_run_service_operations_total{outcome="created"} %d
sre_repair_run_service_operations_total{outcome="read"} %d
sre_repair_run_service_operations_total{outcome="event"} %d
sre_repair_run_service_operations_total{outcome="updated"} %d
sre_repair_run_service_operations_total{outcome="rejected"} %d
sre_repair_run_service_operations_total{outcome="failed"} %d
`, metrics.created.Load(), metrics.read.Load(), metrics.event.Load(), metrics.updated.Load(), metrics.rejected.Load(), metrics.failed.Load())
}
