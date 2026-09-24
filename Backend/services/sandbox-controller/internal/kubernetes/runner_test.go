package kubernetes

import (
	"context"
	"errors"
	"testing"

	"github.com/sre-agent/sandbox-controller/internal/application"
	"github.com/sre-agent/sandbox-controller/internal/domain"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func sandboxInput() domain.ProvisionSandboxInput {
	return domain.ProvisionSandboxInput{RepairRunID: "run-1", Toolchain: "go", Image: "trusted/go:1", SourceArchiveURL: "http://github-app:4050/archive", ExpectedCommit: "abcdef1234567", VerificationProfile: "go", Changes: []domain.SandboxChange{{Path: "main.go", Content: "package main"}}}
}

func TestProvisionCreatesRestrictedIdempotentJob(t *testing.T) {
	client := fake.NewSimpleClientset()
	runner := NewJobProvisionerV1(client, "sandboxes", "gvisor", "service-token")
	first, err := runner.Provision(context.Background(), sandboxInput())
	if err != nil {
		t.Fatal(err)
	}
	second, err := runner.Provision(context.Background(), sandboxInput())
	if err != nil {
		t.Fatal(err)
	}
	if first.Name != second.Name {
		t.Fatalf("expected idempotent name: %q %q", first.Name, second.Name)
	}
	job, err := client.BatchV1().Jobs("sandboxes").Get(context.Background(), first.Name, metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	pod := job.Spec.Template.Spec
	container := pod.Containers[0]
	if pod.AutomountServiceAccountToken == nil || *pod.AutomountServiceAccountToken {
		t.Fatal("service account token must be disabled")
	}
	if container.SecurityContext.AllowPrivilegeEscalation == nil || *container.SecurityContext.AllowPrivilegeEscalation {
		t.Fatal("privilege escalation must be disabled")
	}
	if container.SecurityContext.ReadOnlyRootFilesystem == nil || !*container.SecurityContext.ReadOnlyRootFilesystem {
		t.Fatal("root filesystem must be read-only")
	}
}

func TestProvisionRejectsDifferentTaskForSameRun(t *testing.T) {
	client := fake.NewSimpleClientset()
	runner := NewJobProvisionerV1(client, "sandboxes", "gvisor", "service-token")
	if _, err := runner.Provision(context.Background(), sandboxInput()); err != nil {
		t.Fatal(err)
	}
	changed := sandboxInput()
	changed.Changes[0].Content = "package changed"
	_, err := runner.Provision(context.Background(), changed)
	if !errors.Is(err, application.ErrSandboxConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
}
