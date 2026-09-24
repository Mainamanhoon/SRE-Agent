package application

import (
	"context"

	"github.com/sre-agent/sandbox-controller/internal/domain"
)

// SandboxCreator is the application contract exposed to inbound transports.
type SandboxCreator interface {
	Create(context.Context, domain.CreateSandboxInput) (domain.Sandbox, error)
}

type SandboxReader interface {
	Get(context.Context, string) (domain.Sandbox, error)
	Result(context.Context, string) (domain.SandboxExecutionResult, error)
}

type SandboxDeleter interface {
	Delete(context.Context, string) error
}

// SandboxProvisioner is implemented by replaceable execution-platform adapters.
type SandboxProvisioner interface {
	Provision(context.Context, domain.ProvisionSandboxInput) (domain.Sandbox, error)
	Get(context.Context, string) (domain.Sandbox, error)
	Result(context.Context, string) (domain.SandboxExecutionResult, error)
	Delete(context.Context, string) error
}

// ToolchainImageResolver maps a requested toolchain to an approved image.
type ToolchainImageResolver interface {
	Resolve(toolchain string) (string, bool)
}

// ReadinessProbe keeps infrastructure health separate from provisioning behavior.
type ReadinessProbe interface {
	Ready(context.Context) error
}

type RequestAuthenticator interface{ Authenticate(string) bool }
type RequestLimiter interface{ Allow() bool }
type SandboxMetrics interface {
	Observe(string)
	Prometheus() string
}
