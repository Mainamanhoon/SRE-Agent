package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/sre-agent/github-app/internal/domain"
)

var (
	webhookDeliveryIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,100}$`)
	webhookRunIDPattern      = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,62}$`)
	webhookRepositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
	webhookCommitPattern     = regexp.MustCompile(`^[a-fA-F0-9]{7,64}$`)
)

type WebhookIntakeServiceV1 struct{ store WebhookDeliveryStore }

func WebhookRetryDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := time.Second * time.Duration(1<<min(attempt, 9))
	if delay > 15*time.Minute {
		return 15 * time.Minute
	}
	return delay
}

func NewWebhookIntakeServiceV1(store WebhookDeliveryStore) *WebhookIntakeServiceV1 {
	return &WebhookIntakeServiceV1{store: store}
}

func (service *WebhookIntakeServiceV1) Accept(ctx context.Context, deliveryID, event string, body []byte) (bool, error) {
	if !webhookDeliveryIDPattern.MatchString(deliveryID) || len(event) == 0 || len(event) > 50 || len(body) == 0 {
		return false, ErrInvalidRequest
	}
	delivery, err := parseWebhook(deliveryID, event, body)
	if err != nil {
		return false, err
	}
	return service.store.Accept(ctx, delivery)
}

func parseWebhook(deliveryID, event string, body []byte) (domain.WebhookDelivery, error) {
	payloadHash := sha256.Sum256(body)
	delivery := domain.WebhookDelivery{
		ID: deliveryID, Event: event,
		PayloadSHA256: hex.EncodeToString(payloadHash[:]),
	}
	var payload struct {
		Action       string `json:"action"`
		Installation *struct {
			ID int64 `json:"id"`
		} `json:"installation"`
		Repository struct {
			FullName string `json:"full_name"`
		} `json:"repository"`
		PullRequest struct {
			Number         int    `json:"number"`
			Merged         bool   `json:"merged"`
			MergeCommitSHA string `json:"merge_commit_sha"`
			Head           struct {
				Ref string `json:"ref"`
				SHA string `json:"sha"`
			} `json:"head"`
		} `json:"pull_request"`
	}
	if len(body) > 2<<20 || json.Unmarshal(body, &payload) != nil {
		return domain.WebhookDelivery{}, ErrInvalidRequest
	}
	delivery.Action = payload.Action
	if len(delivery.Action) > 50 {
		return domain.WebhookDelivery{}, ErrInvalidRequest
	}
	if payload.Installation != nil {
		delivery.InstallationID = payload.Installation.ID
	}
	if event != "pull_request" {
		return delivery, nil
	}
	if payload.PullRequest.Number < 1 || !webhookRepositoryPattern.MatchString(payload.Repository.FullName) {
		return domain.WebhookDelivery{}, ErrInvalidRequest
	}
	delivery.Repository = strings.ToLower(payload.Repository.FullName)
	delivery.PullRequestNumber = payload.PullRequest.Number
	delivery.HeadCommitSHA = strings.ToLower(payload.PullRequest.Head.SHA)
	switch delivery.Action {
	case "closed":
		delivery.Merged = payload.PullRequest.Merged
		if delivery.Merged {
			if payload.PullRequest.MergeCommitSHA != "" && !webhookCommitPattern.MatchString(payload.PullRequest.MergeCommitSHA) {
				return domain.WebhookDelivery{}, ErrInvalidRequest
			}
			delivery.MergeCommit = strings.ToLower(payload.PullRequest.MergeCommitSHA)
		}
	case "ready_for_review":
		delivery.ReviewState = "ready_for_review"
	case "converted_to_draft":
		delivery.ReviewState = "draft"
	default:
		return delivery, nil
	}
	const branchPrefix = "sre-agent/repair-"
	branch := payload.PullRequest.Head.Ref
	if strings.HasPrefix(branch, branchPrefix) {
		runID := strings.TrimPrefix(branch, branchPrefix)
		if !webhookRunIDPattern.MatchString(runID) || payload.Installation == nil || payload.Installation.ID < 1 || !webhookCommitPattern.MatchString(delivery.HeadCommitSHA) {
			return domain.WebhookDelivery{}, ErrInvalidRequest
		}
		delivery.RepairRunID = runID
	}
	return delivery, nil
}

type WebhookOutcomeHandlerV1 struct {
	identity   RepairRunIdentityVerifier
	repairRuns RepairRunOutcomeGateway
	incidents  IncidentOutcomeGateway
}

func NewWebhookOutcomeHandlerV1(identity RepairRunIdentityVerifier, repairRuns RepairRunOutcomeGateway, incidents IncidentOutcomeGateway) *WebhookOutcomeHandlerV1 {
	return &WebhookOutcomeHandlerV1{identity: identity, repairRuns: repairRuns, incidents: incidents}
}

func (handler *WebhookOutcomeHandlerV1) Handle(ctx context.Context, delivery domain.WebhookDelivery) error {
	if delivery.Event != "pull_request" || delivery.RepairRunID == "" {
		return nil
	}
	commitRunID, err := handler.identity.RepairRunIDFromCommit(ctx, delivery.InstallationID, delivery.Repository, delivery.HeadCommitSHA)
	if err != nil {
		return err
	}
	if commitRunID == "" || !strings.EqualFold(commitRunID, delivery.RepairRunID) {
		return nil
	}
	delivery.RepairRunID = commitRunID
	run, err := handler.repairRuns.Get(ctx, delivery.RepairRunID)
	if errors.Is(err, ErrRepairRunNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	repository := strings.ToLower(run.RepositoryOwner + "/" + run.RepositoryName)
	if repository != delivery.Repository || run.PullRequestNumber > 0 && run.PullRequestNumber != delivery.PullRequestNumber {
		return nil
	}
	event := domain.RepairOutcomeEvent{
		RepairRunID: delivery.RepairRunID, Stage: "github_webhook",
		IdempotencyKey: "github-delivery:" + delivery.ID,
		Metadata:       map[string]any{"pullRequestNumber": delivery.PullRequestNumber},
	}
	switch delivery.Action {
	case "closed":
		if delivery.Merged {
			event.EventType, event.Outcome, event.Status = "pull_request_merged", "merged", "resolved"
			event.Metadata["reviewState"] = "merged"
			if delivery.MergeCommit != "" {
				event.Metadata["mergeCommit"] = delivery.MergeCommit
			}
		} else {
			event.EventType, event.Outcome, event.Status = "pull_request_closed_unmerged", "closed", "failed"
			event.Metadata["reviewState"] = "closed_unmerged"
		}
	case "ready_for_review", "converted_to_draft":
		event.EventType, event.Outcome = "pull_request_review_state_changed", "updated"
		event.Metadata["reviewState"] = delivery.ReviewState
	default:
		return nil
	}
	if err = handler.repairRuns.RecordEvent(ctx, event); err != nil {
		return err
	}
	if event.Status != "" {
		return handler.incidents.UpdateStatus(ctx, run.IncidentID, event.Status)
	}
	return nil
}

type WebhookDeliveryProcessorV1 struct {
	store       WebhookDeliveryStore
	sink        WebhookOutcomeSink
	credentials InstallationCredentialInvalidator
	workerID    string
}

func NewWebhookDeliveryProcessorV1(store WebhookDeliveryStore, sink WebhookOutcomeSink, credentials InstallationCredentialInvalidator, workerID string) *WebhookDeliveryProcessorV1 {
	return &WebhookDeliveryProcessorV1{store: store, sink: sink, credentials: credentials, workerID: workerID}
}

func (processor *WebhookDeliveryProcessorV1) Run(ctx context.Context) {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		worked, err := processor.ProcessOne(ctx)
		if err != nil {
			slog.Warn("webhook outbox processing failed", "error", err)
		}
		if worked {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (processor *WebhookDeliveryProcessorV1) ProcessOne(ctx context.Context) (bool, error) {
	delivery, found, err := processor.store.Claim(ctx, processor.workerID)
	if err != nil || !found {
		return false, err
	}
	if delivery.Event == "installation" && delivery.InstallationID > 0 {
		switch delivery.Action {
		case "created", "unsuspend", "deleted", "suspend":
			available := delivery.Action == "created" || delivery.Action == "unsuspend"
			err = processor.store.SetInstallationAvailable(ctx, delivery.InstallationID, available)
			if err == nil {
				processor.credentials.Invalidate(delivery.InstallationID)
			}
		}
	} else {
		err = processor.sink.Handle(ctx, delivery)
	}
	if err != nil {
		if retryErr := processor.store.Retry(ctx, delivery.ID, processor.workerID, "OUTCOME_DELIVERY_FAILED", delivery.Attempt); retryErr != nil {
			return true, errors.Join(err, retryErr)
		}
		return true, nil
	}
	return true, processor.store.Complete(ctx, delivery.ID, processor.workerID)
}
