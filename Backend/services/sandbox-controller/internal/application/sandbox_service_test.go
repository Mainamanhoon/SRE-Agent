package application

import (
	"context"
	"testing"

	"github.com/sre-agent/sandbox-controller/internal/domain"
)

type fakeProvisioner struct {
	input domain.ProvisionSandboxInput
}

func (provisioner *fakeProvisioner) Provision(_ context.Context, input domain.ProvisionSandboxInput) (domain.Sandbox, error) {
	provisioner.input = input
	return domain.Sandbox{Name: "sandbox-1", Status: "created"}, nil
}

type fakeImages map[string]string

func (images fakeImages) Resolve(toolchain string) (string, bool) {
	image, ok := images[toolchain]
	return image, ok
}

func TestCreateResolvesAnAllowlistedImage(t *testing.T) {
	provisioner := &fakeProvisioner{}
	service := NewSandboxServiceV1(provisioner, fakeImages{"node": "trusted/node:1"})

	_, err := service.Create(context.Background(), domain.CreateSandboxInput{RepairRunID: "repair-1", Toolchain: "node"})
	if err != nil {
		t.Fatalf("create sandbox: %v", err)
	}
	if provisioner.input.Image != "trusted/node:1" {
		t.Fatalf("expected resolved image, got %q", provisioner.input.Image)
	}
}
