package metrics

import (
	"fmt"
	"github.com/sre-agent/github-app/internal/application"
	"sync/atomic"
)

var _ application.Metrics = (*MetricsV1)(nil)

type MetricsV1 struct{ delivered, archived, webhook, rejected, failed atomic.Uint64 }

func (metrics *MetricsV1) Observe(outcome string) {
	switch outcome {
	case "delivered":
		metrics.delivered.Add(1)
	case "archived":
		metrics.archived.Add(1)
	case "webhook":
		metrics.webhook.Add(1)
	case "rejected":
		metrics.rejected.Add(1)
	default:
		metrics.failed.Add(1)
	}
}
func (metrics *MetricsV1) Prometheus() string {
	return fmt.Sprintf("# HELP sre_github_app_operations_total GitHub App operations by outcome.\n# TYPE sre_github_app_operations_total counter\nsre_github_app_operations_total{outcome=\"delivered\"} %d\nsre_github_app_operations_total{outcome=\"archived\"} %d\nsre_github_app_operations_total{outcome=\"webhook\"} %d\nsre_github_app_operations_total{outcome=\"rejected\"} %d\nsre_github_app_operations_total{outcome=\"failed\"} %d\n", metrics.delivered.Load(), metrics.archived.Load(), metrics.webhook.Load(), metrics.rejected.Load(), metrics.failed.Load())
}
