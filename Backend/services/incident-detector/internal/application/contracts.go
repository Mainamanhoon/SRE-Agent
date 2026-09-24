package application

import (
	"context"
	"time"

	"github.com/sre-agent/incident-detector/internal/domain"
)

// CandidateDetector is the version-independent contract exposed to transports.
type CandidateDetector interface {
	Detect(context.Context, domain.Candidate) (domain.DetectedCandidate, error)
}

// FingerprintGenerator is implemented by replaceable fingerprint algorithms.
type FingerprintGenerator interface {
	Fingerprint(domain.Candidate) string
}

// Clock isolates system time from application behavior.
type Clock interface {
	Now() time.Time
}

// CandidateSink persists or publishes an accepted candidate. Implementations
// own transport-specific retries and response validation.
type CandidateSink interface {
	Record(context.Context, domain.Candidate, string) (string, error)
}

// ReadinessProbe verifies dependencies required to accept new work.
type ReadinessProbe interface {
	Check(context.Context) error
}

// RequestAuthenticator isolates authentication policy from the HTTP adapter.
type RequestAuthenticator interface {
	Authenticate(string) bool
}

// RequestLimiter is an admission-control boundary that can be replaced by a
// distributed limiter without changing the transport.
type RequestLimiter interface {
	Allow() bool
}

// CandidateMetrics keeps instrumentation independent from business behavior.
type CandidateMetrics interface {
	Observe(string)
	Prometheus() string
}
