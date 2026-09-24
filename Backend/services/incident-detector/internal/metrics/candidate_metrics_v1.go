package metrics

import (
	"fmt"
	"sync/atomic"

	"github.com/sre-agent/incident-detector/internal/application"
)

var _ application.CandidateMetrics = (*CandidateMetricsV1)(nil)

type CandidateMetricsV1 struct {
	accepted atomic.Uint64
	invalid  atomic.Uint64
	limited  atomic.Uint64
	failed   atomic.Uint64
}

func (metrics *CandidateMetricsV1) Observe(outcome string) {
	switch outcome {
	case "accepted":
		metrics.accepted.Add(1)
	case "invalid":
		metrics.invalid.Add(1)
	case "limited":
		metrics.limited.Add(1)
	default:
		metrics.failed.Add(1)
	}
}

func (metrics *CandidateMetricsV1) Prometheus() string {
	return fmt.Sprintf(`# HELP sre_incident_detector_candidates_total Candidate requests by outcome.
# TYPE sre_incident_detector_candidates_total counter
sre_incident_detector_candidates_total{outcome="accepted"} %d
sre_incident_detector_candidates_total{outcome="invalid"} %d
sre_incident_detector_candidates_total{outcome="limited"} %d
sre_incident_detector_candidates_total{outcome="failed"} %d
`, metrics.accepted.Load(), metrics.invalid.Load(), metrics.limited.Load(), metrics.failed.Load())
}
