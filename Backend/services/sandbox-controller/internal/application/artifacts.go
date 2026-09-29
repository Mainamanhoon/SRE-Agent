package application

import (
	"context"
	"io"

	"github.com/sre-agent/sandbox-controller/internal/domain"
)

// ArtifactStore durably records terminal sandbox results before a pod is deleted.
// Implementations may use object storage or a database; callers never depend on
// the storage technology.
type ArtifactStore interface {
	PutResult(context.Context, string, domain.SandboxExecutionResult) (ArtifactReference, error)
	GetResult(context.Context, string) (domain.SandboxExecutionResult, error)
	PutArtifact(context.Context, string, string, io.Reader, int64) (ArtifactReference, error)
}

type ArtifactReference struct {
	Key       string `json:"key"`
	MediaType string `json:"mediaType"`
	Bytes     int64  `json:"bytes"`
	SHA256    string `json:"sha256"`
}

// ArtifactRetentionPolicy is deliberately separate so legal/operational
// retention can change without changing sandbox execution.
type ArtifactRetentionPolicy interface {
	ResultTTL() int
	MaxArtifactBytes() int64
}
