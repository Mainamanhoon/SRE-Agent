package metrics

import (
	"fmt"
	"sync/atomic"

	"github.com/sre-agent/incident-service/internal/application"
)

var _ application.IncidentMetrics = (*IncidentMetricsV1)(nil)

type IncidentMetricsV1 struct{ recorded, read, updated, rejected, failed atomic.Uint64 }

func (metrics *IncidentMetricsV1) Observe(outcome string) {
	switch outcome {
	case "recorded":
		metrics.recorded.Add(1)
	case "read":
		metrics.read.Add(1)
	case "updated":
		metrics.updated.Add(1)
	case "rejected":
		metrics.rejected.Add(1)
	default:
		metrics.failed.Add(1)
	}
}

func (metrics *IncidentMetricsV1) Prometheus() string {
	return fmt.Sprintf(`# HELP sre_incident_service_operations_total Incident service operations by outcome.
# TYPE sre_incident_service_operations_total counter
sre_incident_service_operations_total{outcome="recorded"} %d
sre_incident_service_operations_total{outcome="read"} %d
sre_incident_service_operations_total{outcome="updated"} %d
sre_incident_service_operations_total{outcome="rejected"} %d
sre_incident_service_operations_total{outcome="failed"} %d
`, metrics.recorded.Load(), metrics.read.Load(), metrics.updated.Load(), metrics.rejected.Load(), metrics.failed.Load())
}
