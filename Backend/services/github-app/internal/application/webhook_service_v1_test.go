package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/sre-agent/github-app/internal/domain"
)

type fakeWebhookStore struct {
	delivery domain.WebhookDelivery
	accepted bool
	claimed  bool
	retried  bool
	complete bool
	active   bool
}

func (store *fakeWebhookStore) Accept(_ context.Context, delivery domain.WebhookDelivery) (bool, error) {
	store.delivery, store.accepted = delivery, true
	return true, nil
}
func (store *fakeWebhookStore) Claim(context.Context, string) (domain.WebhookDelivery, bool, error) {
	if store.claimed {
		return domain.WebhookDelivery{}, false, nil
	}
	store.claimed = true
	store.delivery.Attempt = 1
	return store.delivery, true, nil
}
func (store *fakeWebhookStore) Complete(context.Context, string, string) error {
	store.complete = true
	return nil
}
func (store *fakeWebhookStore) Retry(context.Context, string, string, string, int) error {
	store.retried = true
	return nil
}
func (store *fakeWebhookStore) SetInstallationAvailable(_ context.Context, _ int64, active bool) error {
	store.active = active
	return nil
}
func (store *fakeWebhookStore) InstallationAvailable(context.Context, int64) (bool, error) {
	return true, nil
}
func (store *fakeWebhookStore) Ping(context.Context) error { return nil }

func TestParseWebhookStoresOnlyNormalizedRepairOutcome(t *testing.T) {
	body := []byte(`{"action":"closed","installation":{"id":42},"repository":{"full_name":"Example/Service"},"pull_request":{"number":17,"merged":true,"merge_commit_sha":"abcdef1234567","head":{"ref":"sre-agent/repair-run-1","sha":"fedcba9876543"}}}`)
	delivery, err := parseWebhook("delivery-1", "pull_request", body)
	if err != nil {
		t.Fatal(err)
	}
	if delivery.RepairRunID != "run-1" || delivery.Repository != "example/service" || delivery.MergeCommit != "abcdef1234567" || delivery.HeadCommitSHA != "fedcba9876543" || delivery.PullRequestNumber != 17 || delivery.InstallationID != 42 || delivery.PayloadSHA256 == "" {
		t.Fatalf("unexpected normalized delivery: %#v", delivery)
	}
	if delivery.Action != "closed" || !delivery.Merged {
		t.Fatalf("unexpected close outcome: %#v", delivery)
	}
}

func TestParseWebhookRejectsInvalidDeterministicRunBranch(t *testing.T) {
	body := []byte(`{"action":"closed","repository":{"full_name":"example/service"},"pull_request":{"number":1,"head":{"ref":"sre-agent/repair-../escape"}}}`)
	if _, err := parseWebhook("delivery-2", "pull_request", body); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid repair branch rejection, got %v", err)
	}
}

type fakeOutcomeGateways struct {
	run    domain.RepairRunReference
	event  domain.RepairOutcomeEvent
	status string
	err    error
}

func (gateway *fakeOutcomeGateways) Get(context.Context, string) (domain.RepairRunReference, error) {
	return gateway.run, gateway.err
}
func (gateway *fakeOutcomeGateways) RepairRunIDFromCommit(context.Context, int64, string, string) (string, error) {
	return "run-1", nil
}
func (gateway *fakeOutcomeGateways) RecordEvent(_ context.Context, event domain.RepairOutcomeEvent) error {
	gateway.event = event
	return nil
}
func (gateway *fakeOutcomeGateways) UpdateStatus(_ context.Context, _, status string) error {
	gateway.status = status
	return nil
}

func TestWebhookOutcomeHandlerValidatesRepositoryAndPersistsMergeExactlyByDelivery(t *testing.T) {
	gateway := &fakeOutcomeGateways{run: domain.RepairRunReference{
		ID: "run-1", IncidentID: "incident-1", RepositoryOwner: "example", RepositoryName: "service", PullRequestNumber: 17,
	}}
	handler := NewWebhookOutcomeHandlerV1(gateway, gateway, gateway)
	delivery := domain.WebhookDelivery{
		ID: "delivery-1", Event: "pull_request", Action: "closed", Repository: "example/service",
		RepairRunID: "run-1", InstallationID: 42, HeadCommitSHA: "fedcba9876543", PullRequestNumber: 17, Merged: true, MergeCommit: "abcdef1234567",
	}
	if err := handler.Handle(context.Background(), delivery); err != nil {
		t.Fatal(err)
	}
	if gateway.event.EventType != "pull_request_merged" || gateway.event.Status != "resolved" || gateway.event.IdempotencyKey != "github-delivery:delivery-1" || gateway.status != "resolved" {
		t.Fatalf("merge was not projected consistently: event=%#v status=%q", gateway.event, gateway.status)
	}
	if gateway.event.Metadata["mergeCommit"] != "abcdef1234567" || gateway.event.Metadata["pullRequestNumber"] != 17 {
		t.Fatalf("merge metadata was not recorded: %#v", gateway.event.Metadata)
	}
}

func TestWebhookOutcomeHandlerDoesNotTrustMismatchedRepository(t *testing.T) {
	gateway := &fakeOutcomeGateways{run: domain.RepairRunReference{ID: "run-1", RepositoryOwner: "another", RepositoryName: "repo"}}
	handler := NewWebhookOutcomeHandlerV1(gateway, gateway, gateway)
	err := handler.Handle(context.Background(), domain.WebhookDelivery{
		ID: "delivery-1", Event: "pull_request", Action: "closed", Repository: "example/service",
		RepairRunID: "run-1", InstallationID: 42, HeadCommitSHA: "fedcba9876543", PullRequestNumber: 17, Merged: true,
	})
	if err != nil || gateway.event.EventType != "" || gateway.status != "" {
		t.Fatalf("mismatched repository must not cause side effects: %v %#v", err, gateway)
	}
}

type fakeOutcomeSink struct{ err error }

func (sink fakeOutcomeSink) Handle(context.Context, domain.WebhookDelivery) error { return sink.err }

type fakeCredentialInvalidator struct{ installationID int64 }

func (invalidator *fakeCredentialInvalidator) Invalidate(id int64) { invalidator.installationID = id }

func TestWebhookProcessorRetriesFailureAndUpdatesInstallationState(t *testing.T) {
	store := &fakeWebhookStore{delivery: domain.WebhookDelivery{ID: "delivery-1", Event: "pull_request"}}
	processor := NewWebhookDeliveryProcessorV1(store, fakeOutcomeSink{err: errors.New("unavailable")}, &fakeCredentialInvalidator{}, "worker-1")
	worked, err := processor.ProcessOne(context.Background())
	if err != nil || !worked || !store.retried || store.complete {
		t.Fatalf("expected failed outcome to be retried: worked=%v err=%v store=%#v", worked, err, store)
	}

	installationStore := &fakeWebhookStore{delivery: domain.WebhookDelivery{ID: "delivery-2", Event: "installation", Action: "suspend", InstallationID: 42}}
	invalidator := &fakeCredentialInvalidator{}
	installationProcessor := NewWebhookDeliveryProcessorV1(installationStore, fakeOutcomeSink{}, invalidator, "worker-1")
	if _, err = installationProcessor.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if installationStore.active || invalidator.installationID != 42 || !installationStore.complete {
		t.Fatalf("installation suspension did not disable and invalidate credentials: %#v %#v", installationStore, invalidator)
	}
}

func TestWebhookRetryDelayCapsInsteadOfGrowingWithoutBound(t *testing.T) {
	if delay := WebhookRetryDelay(100); delay > 15*time.Minute {
		t.Fatalf("retry delay exceeded 15 minutes: %s", delay)
	}
}
