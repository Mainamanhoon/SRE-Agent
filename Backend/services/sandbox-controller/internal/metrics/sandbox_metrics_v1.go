package metrics

import (
	"fmt"
	"sync/atomic"

	"github.com/sre-agent/sandbox-controller/internal/application"
)

var _ application.SandboxMetrics = (*SandboxMetricsV1)(nil)

type SandboxMetricsV1 struct{ created, read, deleted, rejected, failed atomic.Uint64 }

func (metrics *SandboxMetricsV1) Observe(outcome string) {
	switch outcome {
	case "created":
		metrics.created.Add(1)
	case "read":
		metrics.read.Add(1)
	case "deleted":
		metrics.deleted.Add(1)
	case "rejected":
		metrics.rejected.Add(1)
	default:
		metrics.failed.Add(1)
	}
}
func (metrics *SandboxMetricsV1) Prometheus() string {
	return fmt.Sprintf("# HELP sre_sandbox_operations_total Sandbox operations by outcome.\n# TYPE sre_sandbox_operations_total counter\nsre_sandbox_operations_total{outcome=\"created\"} %d\nsre_sandbox_operations_total{outcome=\"read\"} %d\nsre_sandbox_operations_total{outcome=\"deleted\"} %d\nsre_sandbox_operations_total{outcome=\"rejected\"} %d\nsre_sandbox_operations_total{outcome=\"failed\"} %d\n", metrics.created.Load(), metrics.read.Load(), metrics.deleted.Load(), metrics.rejected.Load(), metrics.failed.Load())
}
