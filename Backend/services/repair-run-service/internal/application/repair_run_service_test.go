package application

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/sre-agent/repair-run-service/internal/domain"
)

type fixedClock struct{ now time.Time }

func (clock fixedClock) Now() time.Time { return clock.now }

type recordingRepository struct {
	input domain.CreateInput
	list  domain.ListQuery
}

func (repository *recordingRepository) Create(_ context.Context, input domain.CreateInput) (domain.RepairRun, error) {
	repository.input = input
	return domain.RepairRun{ID: input.ID}, nil
}
func (*recordingRepository) Get(context.Context, string) (domain.RepairRun, error) {
	return domain.RepairRun{}, nil
}
func (repository *recordingRepository) List(_ context.Context, query domain.ListQuery) (domain.RunPage, error) {
	repository.list = query
	return domain.RunPage{Items: []domain.RepairRun{
		{ID: "run-b", StartedAt: time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)},
		{ID: "run-a", StartedAt: time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)},
	}}, nil
}
func (*recordingRepository) AppendEvent(context.Context, domain.AppendEventInput) (domain.RunEvent, error) {
	return domain.RunEvent{}, nil
}
func (*recordingRepository) ListEvents(context.Context, string, int64, int) (domain.EventPage, error) {
	return domain.EventPage{}, nil
}
func (*recordingRepository) Update(context.Context, domain.UpdateInput) (domain.RepairRun, error) {
	return domain.RepairRun{}, nil
}
func (*recordingRepository) Ping(context.Context) error { return nil }

func TestCreateNormalizesIdentityAndUsesInjectedClock(t *testing.T) {
	now := time.Date(2026, 9, 24, 1, 2, 3, 0, time.UTC)
	repository := &recordingRepository{}
	service := NewRepairRunServiceV1(repository, fixedClock{now: now})
	_, err := service.Create(context.Background(), domain.CreateInput{
		ID: " run-1 ", IncidentID: "8CB1BB40-215D-4B22-92B2-B080DDDB3166",
		RepositoryOwner: "owner", RepositoryName: "service", ExpectedCommit: "ABCDEF1234567", Toolchain: "node",
	})
	if err != nil {
		t.Fatal(err)
	}
	if repository.input.ID != "run-1" || repository.input.ExpectedCommit != "abcdef1234567" ||
		repository.input.IncidentID != "8cb1bb40-215d-4b22-92b2-b080dddb3166" ||
		!repository.input.Now.Equal(now) {
		t.Fatalf("unexpected normalized create input: %#v", repository.input)
	}
}

func TestCreateRejectsInvalidRepositoryAndCommit(t *testing.T) {
	service := NewRepairRunServiceV1(&recordingRepository{}, fixedClock{now: time.Now()})
	_, err := service.Create(context.Background(), domain.CreateInput{
		ID: "run-1", IncidentID: "8cb1bb40-215d-4b22-92b2-b080dddb3166",
		RepositoryOwner: "owner", RepositoryName: "service", ExpectedCommit: "../bad", Toolchain: "node",
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected input validation error, got %v", err)
	}
}

func TestEventMetadataAllowsOnlyBoundedSafeFields(t *testing.T) {
	good, err := sanitizeMetadata(json.RawMessage(`{"summary":"verified","changedPaths":["src/app.ts"]}`))
	if err != nil || len(good) == 0 {
		t.Fatalf("expected safe metadata to pass: %s, %v", good, err)
	}
	for _, raw := range []string{
		`{"authorization":"Bearer secret"}`,
		`{"summary":"` + strings.Repeat("x", 2001) + `"}`,
		`["not","an","object"]`,
	} {
		if _, err = sanitizeMetadata(json.RawMessage(raw)); !errors.Is(err, ErrMetadata) {
			t.Fatalf("expected metadata rejection for %q, got %v", raw, err)
		}
	}
}

func TestStatusTransitionPolicyIsMonotonicAndAllowsTerminalOutcomes(t *testing.T) {
	if err := ValidateTransition("awaiting_review", "resolved"); err != nil {
		t.Fatal(err)
	}
	if err := ValidateTransition("awaiting_review", "investigating"); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("expected backward transition rejection, got %v", err)
	}
	if err := ValidateTransition("resolved", "failed"); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("expected terminal transition rejection, got %v", err)
	}
}

func TestListUsesStableCursorAndTrimsExtraRow(t *testing.T) {
	repository := &recordingRepository{}
	service := NewRepairRunServiceV1(repository, fixedClock{now: time.Now()})
	page, err := service.List(context.Background(), domain.ListQuery{Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "run-b" || page.NextCursor == "" {
		t.Fatalf("unexpected cursor page: %#v", page)
	}
	_, err = service.List(context.Background(), domain.ListQuery{Limit: 1, Cursor: page.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if repository.list.CursorTime == nil || repository.list.CursorID != "run-b" {
		t.Fatalf("cursor was not decoded into stable tuple: %#v", repository.list)
	}
	if _, err = service.List(context.Background(), domain.ListQuery{Limit: 1, Cursor: "invalid"}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid cursor rejection, got %v", err)
	}
}
