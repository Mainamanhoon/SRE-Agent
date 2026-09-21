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
