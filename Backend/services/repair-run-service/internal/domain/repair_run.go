package domain

import (
	"encoding/json"
	"time"
)

type RepairRun struct {
	ID                  string     `json:"id"`
	IncidentID          string     `json:"incidentId"`
	RepositoryOwner     string     `json:"repositoryOwner"`
	RepositoryName      string     `json:"repositoryName"`
	ExpectedCommit      string     `json:"expectedCommit"`
	Toolchain           string     `json:"toolchain"`
	Status              string     `json:"status"`
	StartedAt           time.Time  `json:"startedAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
	CompletedAt         *time.Time `json:"completedAt,omitempty"`
	Version             int64      `json:"version"`
	DiagnosisSummary    string     `json:"diagnosisSummary,omitempty"`
	AbstentionReason    string     `json:"abstentionReason,omitempty"`
	FailureCode         string     `json:"failureCode,omitempty"`
	SandboxID           string     `json:"sandboxId,omitempty"`
	PullRequestURL      string     `json:"pullRequestUrl,omitempty"`
	PullRequestNumber   int        `json:"pullRequestNumber,omitempty"`
	VerificationSummary string     `json:"verificationSummary,omitempty"`
	Harness             string     `json:"harness,omitempty"`
	Model               string     `json:"model,omitempty"`
	PolicyVersion       string     `json:"policyVersion,omitempty"`
}

type CreateInput struct {
	ID              string
	IncidentID      string
	RepositoryOwner string
	RepositoryName  string
	ExpectedCommit  string
	Toolchain       string
	Now             time.Time
}

type RunEvent struct {
	ID             int64           `json:"id"`
	RepairRunID    string          `json:"repairRunId"`
	EventType      string          `json:"eventType"`
	Stage          string          `json:"stage"`
	Outcome        string          `json:"outcome"`
	Status         string          `json:"status,omitempty"`
	OccurredAt     time.Time       `json:"occurredAt"`
	Metadata       json.RawMessage `json:"metadata"`
	IdempotencyKey string          `json:"idempotencyKey,omitempty"`
}

type AppendEventInput struct {
	RepairRunID    string
	EventType      string
	Stage          string
	Outcome        string
	Status         string
	IdempotencyKey string
	Metadata       json.RawMessage
}

type UpdateInput struct {
	ID                  string
	ExpectedVersion     int64
	Status              string
	DiagnosisSummary    *string
	AbstentionReason    *string
	FailureCode         *string
	SandboxID           *string
	PullRequestURL      *string
	PullRequestNumber   *int
	VerificationSummary *string
	Harness             *string
	Model               *string
	PolicyVersion       *string
}

type ListQuery struct {
	IncidentID string
	Status     string
	Repository string
	From       *time.Time
	To         *time.Time
	Limit      int
	Cursor     string
	CursorTime *time.Time
	CursorID   string
}

type RunPage struct {
	Items      []RepairRun `json:"items"`
	NextCursor string      `json:"nextCursor,omitempty"`
}

type EventPage struct {
	Items      []RunEvent `json:"items"`
	NextCursor int64      `json:"nextCursor,omitempty"`
}
