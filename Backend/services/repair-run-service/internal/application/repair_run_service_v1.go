package application

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/sre-agent/repair-run-service/internal/domain"
)

const maxEventMetadataBytes = 16 * 1024

var (
	runIDPattern        = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$`)
	commitPattern       = regexp.MustCompile(`^[a-fA-F0-9]{7,64}$`)
	incidentIDPattern   = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	namePattern         = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)
	eventNamePattern    = regexp.MustCompile(`^[a-z][a-z0-9_.-]{0,99}$`)
	idempotencyPattern  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$`)
	allowedMetadataKeys = map[string]struct{}{
		"summary": {}, "reasonCode": {}, "failureCode": {}, "sandboxId": {},
		"expectedCommit": {}, "changedPaths": {}, "checkNames": {},
		"pullRequestUrl": {}, "pullRequestNumber": {}, "verificationStatus": {},
		"harness": {}, "model": {}, "policyVersion": {}, "riskScore": {},
		"reviewState": {}, "mergeCommit": {},
	}
)

type RepairRunServiceV1 struct {
	repository RepairRunRepository
	clock      RepairRunClock
}

func NewRepairRunServiceV1(repository RepairRunRepository, clock RepairRunClock) *RepairRunServiceV1 {
	return &RepairRunServiceV1{repository: repository, clock: clock}
}

func (service *RepairRunServiceV1) Create(ctx context.Context, input domain.CreateInput) (domain.RepairRun, error) {
	input.ID = strings.TrimSpace(input.ID)
	input.IncidentID = strings.ToLower(strings.TrimSpace(input.IncidentID))
	input.RepositoryOwner = strings.TrimSpace(input.RepositoryOwner)
	input.RepositoryName = strings.TrimSpace(input.RepositoryName)
	input.ExpectedCommit = strings.ToLower(strings.TrimSpace(input.ExpectedCommit))
	input.Toolchain = strings.ToLower(strings.TrimSpace(input.Toolchain))
	if !runIDPattern.MatchString(input.ID) || !incidentIDPattern.MatchString(input.IncidentID) ||
		!namePattern.MatchString(input.RepositoryOwner) || !namePattern.MatchString(input.RepositoryName) ||
		!commitPattern.MatchString(input.ExpectedCommit) ||
		(input.Toolchain != "node" && input.Toolchain != "go") {
		return domain.RepairRun{}, ErrInvalidInput
	}
	input.Now = service.clock.Now()
	return service.repository.Create(ctx, input)
}

func (service *RepairRunServiceV1) Get(ctx context.Context, id string) (domain.RepairRun, error) {
	if !runIDPattern.MatchString(id) {
		return domain.RepairRun{}, ErrInvalidInput
	}
	return service.repository.Get(ctx, id)
}

func (service *RepairRunServiceV1) List(ctx context.Context, query domain.ListQuery) (domain.RunPage, error) {
	if query.Limit == 0 {
		query.Limit = 50
	}
	if query.Limit < 1 || query.Limit > 100 {
		return domain.RunPage{}, ErrInvalidInput
	}
	if query.Cursor != "" {
		cursorTime, cursorID, err := decodeCursor(query.Cursor)
		if err != nil {
			return domain.RunPage{}, ErrInvalidInput
		}
		query.CursorTime = &cursorTime
		query.CursorID = cursorID
	}
	if query.IncidentID != "" && !incidentIDPattern.MatchString(query.IncidentID) ||
		query.Status != "" && !validStatus(query.Status) {
		return domain.RunPage{}, ErrInvalidInput
	}
	if query.Repository != "" {
		parts := strings.Split(query.Repository, "/")
		if len(parts) != 2 || !namePattern.MatchString(parts[0]) || !namePattern.MatchString(parts[1]) {
			return domain.RunPage{}, ErrInvalidInput
		}
		query.Repository = strings.ToLower(query.Repository)
	}
	if query.From != nil && query.To != nil && query.From.After(*query.To) {
		return domain.RunPage{}, ErrInvalidInput
	}
	page, err := service.repository.List(ctx, query)
	if err != nil {
		return domain.RunPage{}, err
	}
	if len(page.Items) > query.Limit {
		last := page.Items[query.Limit-1]
		page.Items = page.Items[:query.Limit]
		page.NextCursor = encodeCursor(last.StartedAt, last.ID)
	}
	return page, nil
}

func (service *RepairRunServiceV1) AppendEvent(ctx context.Context, input domain.AppendEventInput) (domain.RunEvent, error) {
	input.RepairRunID = strings.TrimSpace(input.RepairRunID)
	input.EventType = strings.TrimSpace(input.EventType)
	input.Stage = strings.TrimSpace(input.Stage)
	input.Outcome = strings.TrimSpace(input.Outcome)
	input.Status = strings.TrimSpace(input.Status)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	if !runIDPattern.MatchString(input.RepairRunID) || !eventNamePattern.MatchString(input.EventType) ||
		!eventNamePattern.MatchString(input.Stage) || !eventNamePattern.MatchString(input.Outcome) ||
		!idempotencyPattern.MatchString(input.IdempotencyKey) ||
		(input.Status != "" && !validStatus(input.Status)) {
		return domain.RunEvent{}, ErrInvalidInput
	}
	metadata, err := sanitizeMetadata(input.Metadata)
	if err != nil {
		return domain.RunEvent{}, err
	}
	input.Metadata = metadata
	return service.repository.AppendEvent(ctx, input)
}

func (service *RepairRunServiceV1) ListEvents(ctx context.Context, id string, afterID int64, limit int) (domain.EventPage, error) {
	if !runIDPattern.MatchString(id) || afterID < 0 || limit < 1 || limit > 100 {
		return domain.EventPage{}, ErrInvalidInput
	}
	return service.repository.ListEvents(ctx, id, afterID, limit)
}

func (service *RepairRunServiceV1) Update(ctx context.Context, input domain.UpdateInput) (domain.RepairRun, error) {
	if !runIDPattern.MatchString(input.ID) || input.ExpectedVersion < 1 ||
		(input.Status != "" && !validStatus(input.Status)) ||
		(input.PullRequestNumber != nil && *input.PullRequestNumber < 0) ||
		(input.PullRequestURL != nil && !validPRURL(*input.PullRequestURL)) {
		return domain.RepairRun{}, ErrInvalidInput
	}
	for _, value := range []*string{input.DiagnosisSummary, input.AbstentionReason, input.FailureCode,
		input.SandboxID, input.PullRequestURL, input.VerificationSummary, input.Harness, input.Model, input.PolicyVersion} {
		if value != nil && len(*value) > 8000 {
			return domain.RepairRun{}, ErrInvalidInput
		}
	}
	return service.repository.Update(ctx, input)
}

func sanitizeMetadata(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage(`{}`), nil
	}
	var values map[string]any
	if err := json.Unmarshal(raw, &values); err != nil || values == nil {
		return nil, ErrMetadata
	}
	for key, value := range values {
		if _, allowed := allowedMetadataKeys[key]; !allowed {
			return nil, ErrMetadata
		}
		switch typed := value.(type) {
		case string:
			if len(typed) > 2000 {
				return nil, ErrMetadata
			}
			if key == "pullRequestUrl" && !validPRURL(typed) {
				return nil, ErrMetadata
			}
			if key == "expectedCommit" && !commitPattern.MatchString(typed) {
				return nil, ErrMetadata
			}
		case float64:
			if key == "pullRequestNumber" && (typed < 1 || typed > 2147483647 || typed != float64(int64(typed))) {
				return nil, ErrMetadata
			}
		case bool:
			if key == "pullRequestNumber" {
				return nil, ErrMetadata
			}
		case []any:
			if (key != "changedPaths" && key != "checkNames") || len(typed) > 100 {
				return nil, ErrMetadata
			}
			for _, entry := range typed {
				text, ok := entry.(string)
				if !ok || len(text) > 500 {
					return nil, ErrMetadata
				}
			}
		default:
			return nil, ErrMetadata
		}
	}
	encoded, err := json.Marshal(values)
	if err != nil || len(encoded) > maxEventMetadataBytes {
		return nil, ErrMetadata
	}
	return encoded, nil
}

func validStatus(status string) bool {
	switch status {
	case "queued", "investigating", "diagnosing", "planning", "repairing", "verifying",
		"verified", "delivering", "awaiting_review", "resolved", "ignored", "failed", "abstained":
		return true
	default:
		return false
	}
}

func validPRURL(raw string) bool {
	parsed, err := url.ParseRequestURI(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Host == "github.com" && strings.HasPrefix(parsed.Path, "/")
}

func ValidateTransition(current, next string) error {
	if current == next {
		return nil
	}
	allowed := map[string]map[string]bool{
		"queued":          {"investigating": true, "abstained": true, "failed": true},
		"investigating":   {"diagnosing": true, "abstained": true, "failed": true},
		"diagnosing":      {"planning": true, "abstained": true, "failed": true},
		"planning":        {"repairing": true, "abstained": true, "failed": true},
		"repairing":       {"verifying": true, "failed": true},
		"verifying":       {"verified": true, "failed": true},
		"verified":        {"delivering": true, "failed": true},
		"delivering":      {"awaiting_review": true, "failed": true},
		"awaiting_review": {"resolved": true, "ignored": true, "failed": true},
	}
	if allowed[current][next] {
		return nil
	}
	return fmt.Errorf("%w: %s to %s", ErrInvalidTransition, current, next)
}

func encodeCursor(startedAt time.Time, id string) string {
	data, _ := json.Marshal(struct {
		StartedAt time.Time `json:"startedAt"`
		ID        string    `json:"id"`
	}{StartedAt: startedAt.UTC(), ID: id})
	return base64.RawURLEncoding.EncodeToString(data)
}

func decodeCursor(raw string) (time.Time, string, error) {
	data, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil || len(data) > 512 {
		return time.Time{}, "", ErrInvalidInput
	}
	var cursor struct {
		StartedAt time.Time `json:"startedAt"`
		ID        string    `json:"id"`
	}
	if err = json.Unmarshal(data, &cursor); err != nil || cursor.StartedAt.IsZero() || !runIDPattern.MatchString(cursor.ID) {
		return time.Time{}, "", ErrInvalidInput
	}
	return cursor.StartedAt, cursor.ID, nil
}
