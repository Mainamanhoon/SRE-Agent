package application

import (
	"context"
	"errors"

	"github.com/sre-agent/github-app/internal/domain"
)

var (
	ErrInvalidRequest     = errors.New("invalid request")
	ErrRepositoryNotFound = errors.New("repository not found")
	ErrDeliveryConflict   = errors.New("repair branch exists with different content")
	ErrWebhookConflict    = errors.New("webhook delivery id conflicts with stored content")
	ErrRepairRunNotFound  = errors.New("repair run not found")
)

type DeliveryCreator interface {
	Create(context.Context, domain.DeliveryRequest) (domain.Delivery, error)
}
type SourceArchiveReader interface {
	Archive(context.Context, int64, string, string) (domain.Archive, error)
}
type GitHubGateway interface {
	Archive(context.Context, int64, string, string) (domain.Archive, error)
	CreateBlob(context.Context, int64, string, string, string) (string, error)
	GetCommitTree(context.Context, int64, string, string) (string, error)
	CreateTree(context.Context, int64, string, string, []domain.FileChange, map[string]string) (string, error)
	CreateCommit(context.Context, int64, string, string, string, string) (string, error)
	GetReference(context.Context, int64, string, string) (string, bool, error)
	CommitMatchesRepair(context.Context, int64, string, string, string, string) (bool, error)
	CreateReference(context.Context, int64, string, string, string) error
	FindPullRequest(context.Context, int64, string, string) (number int, url string, found bool, err error)
	CreateDraftPullRequest(context.Context, int64, string, string, string, string, string) (number int, url string, err error)
}
type InstallationTokenProvider interface {
	Token(context.Context, int64) (string, error)
}
type RequestAuthenticator interface{ Authenticate(string) bool }
type RequestLimiter interface{ Allow() bool }
type WebhookVerifier interface {
	Verify(body []byte, signature string) bool
}
type ReadinessProbe interface{ Ping(context.Context) error }
type WebhookDeliveryStore interface {
	Accept(context.Context, domain.WebhookDelivery) (created bool, err error)
	Claim(context.Context, string) (domain.WebhookDelivery, bool, error)
	Complete(context.Context, string, string) error
	Retry(context.Context, string, string, string, int) error
	SetInstallationAvailable(context.Context, int64, bool) error
	InstallationAvailable(context.Context, int64) (bool, error)
	Ping(context.Context) error
}
type WebhookOutcomeSink interface {
	Handle(context.Context, domain.WebhookDelivery) error
}
type WebhookAcceptor interface {
	Accept(context.Context, string, string, []byte) (created bool, err error)
}
type InstallationCredentialInvalidator interface {
	Invalidate(int64)
}
type InstallationStateReader interface {
	InstallationAvailable(context.Context, int64) (bool, error)
}
type RepairRunOutcomeGateway interface {
	Get(context.Context, string) (domain.RepairRunReference, error)
	RecordEvent(context.Context, domain.RepairOutcomeEvent) error
}
type RepairRunIdentityVerifier interface {
	RepairRunIDFromCommit(context.Context, int64, string, string) (string, error)
}
type IncidentOutcomeGateway interface {
	UpdateStatus(context.Context, string, string) error
}
type Metrics interface {
	Observe(string)
	Prometheus() string
}
