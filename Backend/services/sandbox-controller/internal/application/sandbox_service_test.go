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
func (provisioner *fakeProvisioner) Get(_ context.Context, repairRunID string) (domain.Sandbox, error) {
	return domain.Sandbox{RepairRunID: repairRunID}, nil
}
func (provisioner *fakeProvisioner) Result(_ context.Context, _ string) (domain.SandboxExecutionResult, error) {
	return domain.SandboxExecutionResult{Status: "succeeded"}, nil
}
func (provisioner *fakeProvisioner) Delete(_ context.Context, _ string) error { return nil }

type fakeImages map[string]string

func (images fakeImages) Resolve(toolchain string) (string, bool) {
	image, ok := images[toolchain]
	return image, ok
}

func TestCreateResolvesAnAllowlistedImage(t *testing.T) {
	provisioner := &fakeProvisioner{}
	service := NewSandboxServiceV1(provisioner, fakeImages{"node": "trusted/node:1"})

	_, err := service.Create(context.Background(), domain.CreateSandboxInput{RepairRunID: "repair-1", Toolchain: "node", SourceArchiveURL: "https://github-app/api/v1/archive", ExpectedCommit: "abcdef1234567", VerificationProfile: "node", Changes: []domain.SandboxChange{{Path: "src/app.ts", Content: "fixed"}}})
	if err != nil {
		t.Fatalf("create sandbox: %v", err)
	}
	if provisioner.input.Image != "trusted/node:1" {
		t.Fatalf("expected resolved image, got %q", provisioner.input.Image)
	}
}
