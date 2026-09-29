package application

import (
	"context"
	"testing"
	"time"

	"github.com/sre-agent/incident-service/internal/domain"
)

const testIncidentID = "11111111-1111-4111-8111-111111111111"

type recordingRepository struct {
	input           domain.IncidentInput
	incident        domain.Incident
	query           domain.IncidentListQuery
	nextStatus      string
	occurrenceQuery domain.IncidentOccurrenceQuery
	occurrences     []domain.IncidentOccurrence
}

func (repository *recordingRepository) Upsert(_ context.Context, input domain.IncidentInput) (domain.Incident, error) {
	repository.input = input
	return domain.Incident{ID: testIncidentID, Fingerprint: input.Fingerprint, Severity: input.Severity}, nil
}
func (repository *recordingRepository) FindByID(_ context.Context, _ string) (domain.Incident, error) {
	return repository.incident, nil
}
func (repository *recordingRepository) ListIncidents(_ context.Context, query domain.IncidentListQuery) ([]domain.Incident, error) {
	repository.query = query
	return []domain.Incident{{ID: testIncidentID, LastSeenAt: time.Unix(10, 0)}, {ID: "22222222-2222-4222-8222-222222222222", LastSeenAt: time.Unix(9, 0)}}, nil
}
func (repository *recordingRepository) ListOccurrences(context.Context, string, int) ([]domain.IncidentOccurrence, error) {
	return []domain.IncidentOccurrence{}, nil
}
func (repository *recordingRepository) ListOccurrencePage(_ context.Context, query domain.IncidentOccurrenceQuery) ([]domain.IncidentOccurrence, error) {
	repository.occurrenceQuery = query
	return repository.occurrences, nil
}
func (repository *recordingRepository) UpdateStatus(_ context.Context, _ string, _ string, next string) (domain.Incident, error) {
	repository.nextStatus = next
	return domain.Incident{ID: testIncidentID, Status: next}, nil
}

func TestRecordAppliesDefaultSeverity(t *testing.T) {
	repository := &recordingRepository{}
	service := NewIncidentServiceV1(repository, IncidentStatusPolicyV1{})
	incident, err := service.Record(context.Background(), domain.IncidentInput{Fingerprint: "fingerprint", Service: "checkout", Environment: "production"})
	if err != nil {
		t.Fatalf("record incident: %v", err)
	}
	if incident.Severity != "unknown" || repository.input.Severity != "unknown" {
		t.Fatalf("expected default severity, got %q", incident.Severity)
	}
}

func TestListUsesBoundedKeysetPagination(t *testing.T) {
	repository := &recordingRepository{}
	service := NewIncidentServiceV1(repository, IncidentStatusPolicyV1{})
	page, err := service.List(context.Background(), ListIncidentsRequest{Limit: 1, Status: "open"})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.NextCursor == "" {
		t.Fatalf("unexpected page: %#v", page)
	}
	if repository.query.Limit != 2 {
		t.Fatalf("expected lookahead limit, got %d", repository.query.Limit)
	}
}

func TestUpdateStatusUsesPolicy(t *testing.T) {
	repository := &recordingRepository{incident: domain.Incident{ID: testIncidentID, Status: "open"}}
	service := NewIncidentServiceV1(repository, IncidentStatusPolicyV1{})
	if _, err := service.UpdateStatus(context.Background(), testIncidentID, "repairing"); err == nil {
		t.Fatal("expected invalid transition")
	}
	if _, err := service.UpdateStatus(context.Background(), testIncidentID, "investigating"); err != nil {
		t.Fatal(err)
	}
	if repository.nextStatus != "investigating" {
		t.Fatalf("unexpected status %q", repository.nextStatus)
	}
}

func TestOccurrencePageUsesBoundedLookaheadAndStableCursor(t *testing.T) {
	repository := &recordingRepository{occurrences: []domain.IncidentOccurrence{
		{ID: 2, ObservedAt: time.Unix(2, 0)},
		{ID: 1, ObservedAt: time.Unix(1, 0)},
	}}
	service := NewIncidentServiceV1(repository, IncidentStatusPolicyV1{})
	page, err := service.ListOccurrencePage(context.Background(), testIncidentID, 1, "")
	if err != nil || len(page.Items) != 1 || page.NextCursor == "" {
		t.Fatalf("expected one bounded page and a continuation cursor: %#v %v", page, err)
	}
	if repository.occurrenceQuery.Limit != 2 {
		t.Fatalf("expected lookahead row, got query limit %d", repository.occurrenceQuery.Limit)
	}
	if _, err = service.ListOccurrencePage(context.Background(), testIncidentID, 1, "not-a-cursor"); err == nil {
		t.Fatal("expected malformed occurrence cursor to be rejected")
	}
}

func TestAllowedActionsComeFromTheLifecyclePolicy(t *testing.T) {
	repository := &recordingRepository{incident: domain.Incident{ID: testIncidentID, Status: "open"}}
	service := NewIncidentServiceV1(repository, IncidentStatusPolicyV1{})
	actions, err := service.AllowedActions(context.Background(), testIncidentID)
	if err != nil || actions.CurrentStatus != "open" || len(actions.AllowedActions) != 3 {
		t.Fatalf("unexpected lifecycle actions: %#v %v", actions, err)
	}
	for _, forbidden := range actions.AllowedActions {
		if forbidden == "repairing" {
			t.Fatal("UI must not bypass lifecycle transitions")
		}
	}
}
