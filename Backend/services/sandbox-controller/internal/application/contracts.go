package application

import (
	"context"

	"github.com/sre-agent/sandbox-controller/internal/domain"
)

// SandboxCreator is the application contract exposed to inbound transports.
type SandboxCreator interface {
	Create(context.Context, domain.CreateSandboxInput) (domain.Sandbox, error)
}

// SandboxProvisioner is implemented by replaceable execution-platform adapters.
type SandboxProvisioner interface {
	Provision(context.Context, domain.ProvisionSandboxInput) (domain.Sandbox, error)
}

// ToolchainImageResolver maps a requested toolchain to an approved image.
type ToolchainImageResolver interface {
	Resolve(toolchain string) (string, bool)
}

// ReadinessProbe keeps infrastructure health separate from provisioning behavior.
type ReadinessProbe interface {
	Ready(context.Context) error
}
