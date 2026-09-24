package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/incident-service/internal/domain"
)

func TestRepositoryLifecycleIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	store := NewIncidentRepositoryV1(pool)
	fingerprint := "integration-" + time.Now().UTC().Format("20060102150405.000000000")
	input := domain.IncidentInput{Fingerprint: fingerprint, Service: "integration", Environment: "test", Severity: "high", TraceID: "trace-1", ErrorSummary: "boom"}
	first, err := store.Upsert(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.Upsert(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID || second.OccurrenceCount != 2 {
		t.Fatalf("unexpected upsert result: %#v", second)
	}
	occurrences, err := store.ListOccurrences(ctx, first.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(occurrences) != 2 {
		t.Fatalf("expected 2 occurrences, got %d", len(occurrences))
	}
	items, err := store.ListIncidents(ctx, domain.IncidentListQuery{Service: "integration", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Fatal("expected incident in list")
	}
	updated, err := store.UpdateStatus(ctx, first.ID, "open", "investigating")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != "investigating" {
		t.Fatalf("unexpected status %q", updated.Status)
	}
	_, _ = pool.Exec(ctx, "DELETE FROM incidents WHERE id=$1", first.ID)
}
