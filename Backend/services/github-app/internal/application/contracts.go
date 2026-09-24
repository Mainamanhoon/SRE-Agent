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
type Metrics interface {
	Observe(string)
	Prometheus() string
}
