package application

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/sre-agent/github-app/internal/domain"
)

type fakeGateway struct {
	existing   bool
	matching   bool
	missingPR  bool
	createdRef string
}

func (gateway *fakeGateway) Archive(context.Context, int64, string, string) (domain.Archive, error) {
	return domain.Archive{Body: io.NopCloser(strings.NewReader("archive"))}, nil
}
func (gateway *fakeGateway) CreateBlob(context.Context, int64, string, string, string) (string, error) {
	return "blob", nil
}
func (gateway *fakeGateway) GetCommitTree(context.Context, int64, string, string) (string, error) {
	return "tree", nil
}
func (gateway *fakeGateway) CreateTree(context.Context, int64, string, string, []domain.FileChange, map[string]string) (string, error) {
	return "new-tree", nil
}
func (gateway *fakeGateway) CreateCommit(context.Context, int64, string, string, string, string) (string, error) {
	return "commit", nil
}
func (gateway *fakeGateway) GetReference(context.Context, int64, string, string) (string, bool, error) {
	return "commit", gateway.existing, nil
}
func (gateway *fakeGateway) CommitMatchesRepair(context.Context, int64, string, string, string, string) (bool, error) {
	return gateway.matching, nil
}
func (gateway *fakeGateway) CreateReference(_ context.Context, _ int64, _ string, branch, _ string) error {
	gateway.createdRef = branch
	return nil
}
func (gateway *fakeGateway) FindPullRequest(context.Context, int64, string, string) (int, string, bool, error) {
	return 7, "https://example/pr/7", !gateway.missingPR, nil
}
func (gateway *fakeGateway) CreateDraftPullRequest(context.Context, int64, string, string, string, string, string) (int, string, error) {
	return 7, "https://example/pr/7", nil
}

func TestCreateProducesDeterministicDraftPullRequest(t *testing.T) {
	gateway := &fakeGateway{}
	service := NewDeliveryServiceV1(gateway)
	result, err := service.Create(context.Background(), domain.DeliveryRequest{RepairRunID: "run-1", InstallationID: 42, Repository: "acme/api", BaseCommit: "abcdef1234567", BaseBranch: "main", Title: "Repair incident", Changes: []domain.FileChange{{Path: "main.go", Content: "package main"}}})
	if err != nil {
		t.Fatal(err)
	}
	if gateway.createdRef != "sre-agent/repair-run-1" || !result.Draft {
		t.Fatalf("unexpected delivery: %#v", result)
	}
}
func TestCreateReturnsExistingPullRequestOnRetry(t *testing.T) {
	service := NewDeliveryServiceV1(&fakeGateway{existing: true})
	result, err := service.Create(context.Background(), domain.DeliveryRequest{RepairRunID: "run-1", InstallationID: 42, Repository: "acme/api", BaseCommit: "abcdef1234567", BaseBranch: "main", Title: "Repair incident", Changes: []domain.FileChange{{Path: "main.go", Content: "package main"}}})
	if err != nil || result.PullRequestNumber != 7 {
		t.Fatalf("unexpected retry result %#v: %v", result, err)
	}
}

func TestCreateResumesAfterBranchCreation(t *testing.T) {
	service := NewDeliveryServiceV1(&fakeGateway{existing: true, matching: true, missingPR: true})
	result, err := service.Create(context.Background(), domain.DeliveryRequest{RepairRunID: "run-1", InstallationID: 42, Repository: "acme/api", BaseCommit: "abcdef1234567", BaseBranch: "main", Title: "Repair incident", Changes: []domain.FileChange{{Path: "main.go", Content: "package main"}}})
	if err != nil || result.PullRequestNumber != 7 {
		t.Fatalf("unexpected partial retry result %#v: %v", result, err)
	}
}
