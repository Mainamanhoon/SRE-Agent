package application

import (
	"context"
	"errors"
	"strings"

	"github.com/sre-agent/incident-detector/internal/domain"
)

var (
	_ CandidateDetector = (*DetectorV1)(nil)

	ErrInvalidCandidate = errors.New("service and error type are required")
)

// DetectorV1 is the first implementation of CandidateDetector.
type DetectorV1 struct {
	fingerprints FingerprintGenerator
	clock        Clock
}

func NewDetectorV1(fingerprints FingerprintGenerator, clock Clock) *DetectorV1 {
	return &DetectorV1{fingerprints: fingerprints, clock: clock}
}

func (detector *DetectorV1) Detect(_ context.Context, input domain.Candidate) (domain.DetectedCandidate, error) {
	if strings.TrimSpace(input.Service) == "" || strings.TrimSpace(input.ErrorType) == "" {
		return domain.DetectedCandidate{}, ErrInvalidCandidate
	}
	return domain.DetectedCandidate{
		Status:      "candidate_accepted",
		Fingerprint: detector.fingerprints.Fingerprint(input),
		TraceID:     input.TraceID,
		AcceptedAt:  detector.clock.Now().UTC(),
	}, nil
}
