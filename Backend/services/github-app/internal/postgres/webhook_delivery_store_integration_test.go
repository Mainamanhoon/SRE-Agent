package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/github-app/internal/application"
	"github.com/sre-agent/github-app/internal/domain"
)

func TestWebhookOutboxDeliveryDeduplicationLeasingAndInstallationState(t *testing.T) {
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
	store := NewWebhookDeliveryStoreV1(pool)
	deliveryID := fmt.Sprintf("integration-%d", time.Now().UnixNano())
	delivery := domain.WebhookDelivery{
		ID: deliveryID, Event: "pull_request", Action: "closed", PayloadSHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		InstallationID: 909090, Repository: "integration/repository", RepairRunID: "run-integration",
		PullRequestNumber: 7, Merged: true, MergeCommit: "abcdef1234567", HeadCommitSHA: "fedcba9876543",
	}
	created, err := store.Accept(ctx, delivery)
	if err != nil || !created {
		t.Fatalf("first delivery should persist: created=%v err=%v", created, err)
	}
	created, err = store.Accept(ctx, delivery)
	if err != nil || created {
		t.Fatalf("replay should be a no-op: created=%v err=%v", created, err)
	}
	conflicting := delivery
	conflicting.PayloadSHA256 = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
	if _, err = store.Accept(ctx, conflicting); !errors.Is(err, application.ErrWebhookConflict) {
		t.Fatalf("expected payload conflict for reused delivery id, got %v", err)
	}

	claimed, found, err := store.Claim(ctx, "integration-worker")
	if err != nil || !found || claimed.ID != delivery.ID || claimed.Attempt != 1 || claimed.Repository != delivery.Repository || claimed.HeadCommitSHA != delivery.HeadCommitSHA {
		t.Fatalf("delivery was not safely claimed: found=%v delivery=%#v err=%v", found, claimed, err)
	}
	if err = store.Complete(ctx, delivery.ID, "integration-worker"); err != nil {
		t.Fatal(err)
	}
	if err = store.SetInstallationAvailable(ctx, delivery.InstallationID, false); err != nil {
		t.Fatal(err)
	}
	active, err := store.InstallationAvailable(ctx, delivery.InstallationID)
	if err != nil || active {
		t.Fatalf("suspended installation must be unavailable: active=%v err=%v", active, err)
	}
	_, _ = pool.Exec(ctx, "DELETE FROM github_webhook_deliveries WHERE delivery_id=$1", delivery.ID)
	_, _ = pool.Exec(ctx, "DELETE FROM github_installation_state WHERE installation_id=$1", delivery.InstallationID)
}
