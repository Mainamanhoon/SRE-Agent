package application

import (
	"context"
	"testing"

	"github.com/sre-agent/incident-service/internal/domain"
)

type recordingRepository struct {
	input    domain.IncidentInput
	incident domain.Incident
}

func (repository *recordingRepository) Upsert(_ context.Context, input domain.IncidentInput) (domain.Incident, error) {
	repository.input = input
	return domain.Incident{Fingerprint: input.Fingerprint, Severity: input.Severity}, nil
}

func (repository *recordingRepository) FindByID(_ context.Context, _ string) (domain.Incident, error) {
	return repository.incident, nil
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

func TestGetReturnsIncidentFromRepository(t *testing.T) {
	repository := &recordingRepository{incident: domain.Incident{ID: "incident-1", Service: "checkout"}}
	service := NewIncidentServiceV1(repository)

	incident, err := service.Get(context.Background(), "incident-1")
	if err != nil {
		t.Fatalf("get incident: %v", err)
	}
	if incident.ID != "incident-1" || incident.Service != "checkout" {
		t.Fatalf("unexpected incident: %#v", incident)
	}
}
