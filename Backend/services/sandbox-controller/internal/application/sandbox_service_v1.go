package application

import (
	"context"
	"errors"
	"regexp"

	"github.com/sre-agent/sandbox-controller/internal/domain"
)

var (
	_ SandboxCreator = (*SandboxServiceV1)(nil)

	ErrInvalidSandboxRequest = errors.New("invalid sandbox request")
	ErrUnsupportedToolchain  = errors.New("unsupported toolchain")
	repairRunIDPattern       = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$`)
)

// SandboxServiceV1 is the first implementation of SandboxCreator.
type SandboxServiceV1 struct {
	provisioner SandboxProvisioner
	images      ToolchainImageResolver
}

func NewSandboxServiceV1(provisioner SandboxProvisioner, images ToolchainImageResolver) *SandboxServiceV1 {
	return &SandboxServiceV1{provisioner: provisioner, images: images}
}

func (service *SandboxServiceV1) Create(ctx context.Context, input domain.CreateSandboxInput) (domain.Sandbox, error) {
	if !repairRunIDPattern.MatchString(input.RepairRunID) {
		return domain.Sandbox{}, ErrInvalidSandboxRequest
	}
	image, ok := service.images.Resolve(input.Toolchain)
	if !ok {
		return domain.Sandbox{}, ErrUnsupportedToolchain
	}
	return service.provisioner.Provision(ctx, domain.ProvisionSandboxInput{
		RepairRunID: input.RepairRunID,
		Image:       image,
	})
}
