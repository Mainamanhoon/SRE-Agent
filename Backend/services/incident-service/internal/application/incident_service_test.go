package application

import (
	"context"
	"testing"

	"github.com/sre-agent/incident-service/internal/domain"
)

type recordingRepository struct {
	input domain.IncidentInput
}

func (repository *recordingRepository) Upsert(_ context.Context, input domain.IncidentInput) (domain.Incident, error) {
	repository.input = input
	return domain.Incident{Fingerprint: input.Fingerprint, Severity: input.Severity}, nil
}

func TestRecordAppliesDefaultSeverity(t *testing.T) {
	repository := &recordingRepository{}
	service := NewIncidentServiceV1(repository)

	incident, err := service.Record(context.Background(), domain.IncidentInput{
		Fingerprint: "fingerprint",
		Service:     "checkout",
		Environment: "production",
	})
	if err != nil {
		t.Fatalf("record incident: %v", err)
	}
	if incident.Severity != "unknown" || repository.input.Severity != "unknown" {
		t.Fatalf("expected default severity, got %q", incident.Severity)
	}
}
