package application

import (
	"context"
	"errors"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/sre-agent/sandbox-controller/internal/domain"
)

var (
	_ SandboxCreator = (*SandboxServiceV1)(nil)
	_ SandboxReader  = (*SandboxServiceV1)(nil)
	_ SandboxDeleter = (*SandboxServiceV1)(nil)

	ErrInvalidSandboxRequest = errors.New("invalid sandbox request")
	ErrUnsupportedToolchain  = errors.New("unsupported toolchain")
	ErrSandboxNotFound       = errors.New("sandbox not found")
	ErrSandboxConflict       = errors.New("sandbox task conflicts with an existing repair run")
	ErrSandboxNotComplete    = errors.New("sandbox execution is not complete")
	ErrSandboxResultInvalid  = errors.New("sandbox result is invalid")
	repairRunIDPattern       = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$`)
	commitPattern            = regexp.MustCompile(`^[a-fA-F0-9]{7,64}$`)
)

type SandboxServiceV1 struct {
	provisioner SandboxProvisioner
	images      ToolchainImageResolver
}

func NewSandboxServiceV1(provisioner SandboxProvisioner, images ToolchainImageResolver) *SandboxServiceV1 {
	return &SandboxServiceV1{provisioner: provisioner, images: images}
}

func (service *SandboxServiceV1) Create(ctx context.Context, input domain.CreateSandboxInput) (domain.Sandbox, error) {
	if err := validateInput(input); err != nil {
		return domain.Sandbox{}, err
	}
	image, ok := service.images.Resolve(input.Toolchain)
	if !ok {
		return domain.Sandbox{}, ErrUnsupportedToolchain
	}
	return service.provisioner.Provision(ctx, domain.ProvisionSandboxInput{
		RepairRunID: input.RepairRunID, Image: image, Toolchain: input.Toolchain,
		SourceArchiveURL: input.SourceArchiveURL, ExpectedCommit: input.ExpectedCommit,
		Changes: input.Changes, VerificationProfile: input.VerificationProfile,
	})
}

func (service *SandboxServiceV1) Get(ctx context.Context, repairRunID string) (domain.Sandbox, error) {
	if !repairRunIDPattern.MatchString(repairRunID) {
		return domain.Sandbox{}, ErrInvalidSandboxRequest
	}
	return service.provisioner.Get(ctx, repairRunID)
}

func (service *SandboxServiceV1) Result(ctx context.Context, repairRunID string) (domain.SandboxExecutionResult, error) {
	if !repairRunIDPattern.MatchString(repairRunID) {
		return domain.SandboxExecutionResult{}, ErrInvalidSandboxRequest
	}
	return service.provisioner.Result(ctx, repairRunID)
}

func (service *SandboxServiceV1) Delete(ctx context.Context, repairRunID string) error {
	if !repairRunIDPattern.MatchString(repairRunID) {
		return ErrInvalidSandboxRequest
	}
	return service.provisioner.Delete(ctx, repairRunID)
}

func validateInput(input domain.CreateSandboxInput) error {
	if !repairRunIDPattern.MatchString(input.RepairRunID) || !commitPattern.MatchString(input.ExpectedCommit) || len(input.Changes) == 0 || len(input.Changes) > 100 {
		return ErrInvalidSandboxRequest
	}
	parsed, err := url.ParseRequestURI(input.SourceArchiveURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return ErrInvalidSandboxRequest
	}
	if input.VerificationProfile != input.Toolchain {
		return ErrInvalidSandboxRequest
	}
	totalBytes := 0
	for _, change := range input.Changes {
		clean := filepath.ToSlash(filepath.Clean(change.Path))
		if change.Path == "" || filepath.IsAbs(change.Path) || clean == ".." || strings.HasPrefix(clean, "../") || clean != filepath.ToSlash(change.Path) || (change.Delete && change.Content != "") {
			return ErrInvalidSandboxRequest
		}
		totalBytes += len(change.Path) + len(change.Content)
	}
	if totalBytes > 750_000 {
		return ErrInvalidSandboxRequest
	}
	return nil
}
