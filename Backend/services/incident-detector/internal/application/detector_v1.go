package application

import (
	"context"
	"errors"
	"strings"

	"github.com/sre-agent/incident-detector/internal/domain"
)

var (
	_ CandidateDetector = (*DetectorV1)(nil)

	ErrInvalidCandidate  = errors.New("service, environment, and error type are required")
	ErrCandidateDelivery = errors.New("candidate delivery failed")
)

// DetectorV1 is the first implementation of CandidateDetector.
type DetectorV1 struct {
	fingerprints FingerprintGenerator
	clock        Clock
	sink         CandidateSink
}

func NewDetectorV1(fingerprints FingerprintGenerator, clock Clock, sink CandidateSink) *DetectorV1 {
	return &DetectorV1{fingerprints: fingerprints, clock: clock, sink: sink}
}

func (detector *DetectorV1) Detect(ctx context.Context, input domain.Candidate) (domain.DetectedCandidate, error) {
	if strings.TrimSpace(input.Service) == "" || strings.TrimSpace(input.Environment) == "" || strings.TrimSpace(input.ErrorType) == "" {
		return domain.DetectedCandidate{}, ErrInvalidCandidate
	}
	if strings.TrimSpace(input.Severity) == "" {
		input.Severity = "error"
	}
	fingerprint := detector.fingerprints.Fingerprint(input)
	incidentID, err := detector.sink.Record(ctx, input, fingerprint)
	if err != nil {
		return domain.DetectedCandidate{}, errors.Join(ErrCandidateDelivery, err)
	}
	return domain.DetectedCandidate{
		Status:      "candidate_accepted",
		Fingerprint: fingerprint,
		TraceID:     input.TraceID,
		AcceptedAt:  detector.clock.Now().UTC(),
		IncidentID:  incidentID,
	}, nil
}
