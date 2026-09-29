package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/repair-run-service/internal/application"
	"github.com/sre-agent/repair-run-service/internal/domain"
)

func TestRepairRunRepositoryIdempotencyEventsOptimisticUpdateAndPagination(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repository := NewRepairRunRepositoryV1(pool)
	runID := fmt.Sprintf("integration-%d", time.Now().UnixNano())
	incidentID := fmt.Sprintf("8cb1bb40-215d-4b22-92b2-%012x", uint64(time.Now().UnixNano())&0xffffffffffff)
	input := domain.CreateInput{
		ID: runID, IncidentID: incidentID, RepositoryOwner: "integration",
		RepositoryName: "test", ExpectedCommit: "abcdef1234567", Toolchain: "node", Now: time.Now().UTC(),
	}
	first, err := repository.Create(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := repository.Create(ctx, input)
	if err != nil || first.ID != second.ID || first.Version != second.Version {
		t.Fatalf("create retry did not resolve to existing run: %#v, %v", second, err)
	}
	conflicting := input
	conflicting.ExpectedCommit = "123456789abcd"
	if _, err = repository.Create(ctx, conflicting); !errors.Is(err, application.ErrIdempotencyConflict) {
		t.Fatalf("expected create idempotency conflict, got %v", err)
	}

	eventInput := domain.AppendEventInput{
		RepairRunID: runID, EventType: "diagnosis_completed", Stage: "diagnosing", Outcome: "succeeded",
		Status: "investigating", IdempotencyKey: "diagnosis-completed-v1",
		Metadata: []byte(`{"harness":"deepseek","model":"gemini","summary":"found cause"}`),
	}
	event, err := repository.AppendEvent(ctx, eventInput)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := repository.AppendEvent(ctx, eventInput)
	if err != nil || replayed.ID != event.ID {
		t.Fatalf("event retry did not resolve to same record: %#v, %v", replayed, err)
	}
	conflictingEvent := eventInput
	conflictingEvent.Outcome = "failed"
	if _, err = repository.AppendEvent(ctx, conflictingEvent); !errors.Is(err, application.ErrIdempotencyConflict) {
		t.Fatalf("expected event idempotency conflict, got %v", err)
	}

	updated, err := repository.Update(ctx, domain.UpdateInput{
		ID: runID, ExpectedVersion: 2, Status: "diagnosing",
	})
	if err != nil || updated.Version != 3 {
		t.Fatalf("expected optimistic update to advance version: %#v, %v", updated, err)
	}
	if _, err = repository.Update(ctx, domain.UpdateInput{ID: runID, ExpectedVersion: 2, Status: "planning"}); !errors.Is(err, application.ErrConcurrentUpdate) {
		t.Fatalf("expected stale update rejection, got %v", err)
	}

	page, err := repository.List(ctx, domain.ListQuery{IncidentID: incidentID, Repository: "integration/test", Limit: 10})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != runID {
		t.Fatalf("unexpected filtered page: %#v, %v", page, err)
	}
	events, err := repository.ListEvents(ctx, runID, 0, 10)
	if err != nil || len(events.Items) != 2 {
		t.Fatalf("expected creation and diagnosis events, got %#v, %v", events, err)
	}
	if strings.Contains(string(events.Items[1].Metadata), "authorization") {
		t.Fatal("event metadata unexpectedly retained a credential field")
	}
	_, _ = pool.Exec(ctx, "DELETE FROM repair_runs WHERE id=$1", runID)
}
