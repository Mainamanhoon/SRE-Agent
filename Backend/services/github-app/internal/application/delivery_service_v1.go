package application

import (
	"context"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/sre-agent/github-app/internal/domain"
)

var _ DeliveryCreator = (*DeliveryServiceV1)(nil)
var _ SourceArchiveReader = (*DeliveryServiceV1)(nil)

var repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
var runPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$`)
var commitPattern = regexp.MustCompile(`^[a-fA-F0-9]{7,64}$`)

type DeliveryServiceV1 struct{ gateway GitHubGateway }

func NewDeliveryServiceV1(gateway GitHubGateway) *DeliveryServiceV1 {
	return &DeliveryServiceV1{gateway: gateway}
}

func (service *DeliveryServiceV1) Create(ctx context.Context, input domain.DeliveryRequest) (domain.Delivery, error) {
	if err := validateDelivery(input); err != nil {
		return domain.Delivery{}, err
	}
	branch := "sre-agent/repair-" + strings.ToLower(input.RepairRunID)
	existingSHA, exists, err := service.gateway.GetReference(ctx, input.InstallationID, input.Repository, branch)
	if err != nil {
		return domain.Delivery{}, err
	}
	if exists {
		number, url, found, findErr := service.gateway.FindPullRequest(ctx, input.InstallationID, input.Repository, branch)
		if findErr != nil {
			return domain.Delivery{}, findErr
		}
		if found {
			return domain.Delivery{RepairRunID: input.RepairRunID, Branch: branch, CommitSHA: existingSHA, PullRequestNumber: number, PullRequestURL: url, Draft: true}, nil
		}
		matches, matchErr := service.gateway.CommitMatchesRepair(ctx, input.InstallationID, input.Repository, existingSHA, input.BaseCommit, input.RepairRunID)
		if matchErr != nil {
			return domain.Delivery{}, matchErr
		}
		if !matches {
			return domain.Delivery{}, ErrDeliveryConflict
		}
		number, url, createErr := service.gateway.CreateDraftPullRequest(ctx, input.InstallationID, input.Repository, input.BaseBranch, branch, input.Title, input.Body)
		if createErr != nil {
			return domain.Delivery{}, createErr
		}
		return domain.Delivery{RepairRunID: input.RepairRunID, Branch: branch, CommitSHA: existingSHA, PullRequestNumber: number, PullRequestURL: url, Draft: true}, nil
	}
	baseTree, err := service.gateway.GetCommitTree(ctx, input.InstallationID, input.Repository, input.BaseCommit)
	if err != nil {
		return domain.Delivery{}, err
	}
	blobs := make(map[string]string, len(input.Changes))
	for _, change := range input.Changes {
		if change.Delete {
			continue
		}
		sha, blobErr := service.gateway.CreateBlob(ctx, input.InstallationID, input.Repository, change.Path, change.Content)
		if blobErr != nil {
			return domain.Delivery{}, blobErr
		}
		blobs[change.Path] = sha
	}
	tree, err := service.gateway.CreateTree(ctx, input.InstallationID, input.Repository, baseTree, input.Changes, blobs)
	if err != nil {
		return domain.Delivery{}, err
	}
	commitMessage := fmt.Sprintf("%s\n\nSRE-Agent-Repair-Run: %s", input.Title, input.RepairRunID)
	commit, err := service.gateway.CreateCommit(ctx, input.InstallationID, input.Repository, commitMessage, tree, input.BaseCommit)
	if err != nil {
		return domain.Delivery{}, err
	}
	if err = service.gateway.CreateReference(ctx, input.InstallationID, input.Repository, branch, commit); err != nil {
		return domain.Delivery{}, err
	}
	number, url, err := service.gateway.CreateDraftPullRequest(ctx, input.InstallationID, input.Repository, input.BaseBranch, branch, input.Title, input.Body)
	if err != nil {
		return domain.Delivery{}, err
	}
	return domain.Delivery{RepairRunID: input.RepairRunID, Branch: branch, CommitSHA: commit, PullRequestNumber: number, PullRequestURL: url, Draft: true}, nil
}

func (service *DeliveryServiceV1) Archive(ctx context.Context, installationID int64, repository, ref string) (domain.Archive, error) {
	if installationID <= 0 || !repositoryPattern.MatchString(repository) || !commitPattern.MatchString(ref) {
		return domain.Archive{}, ErrInvalidRequest
	}
	return service.gateway.Archive(ctx, installationID, repository, ref)
}

func validateDelivery(input domain.DeliveryRequest) error {
	if input.InstallationID <= 0 || !runPattern.MatchString(input.RepairRunID) || !repositoryPattern.MatchString(input.Repository) || !commitPattern.MatchString(input.BaseCommit) || strings.TrimSpace(input.BaseBranch) == "" || len(input.Title) == 0 || len(input.Title) > 256 || len(input.Body) > 50_000 || len(input.Changes) == 0 || len(input.Changes) > 100 {
		return ErrInvalidRequest
	}
	total := 0
	seen := map[string]bool{}
	for _, change := range input.Changes {
		clean := filepath.ToSlash(filepath.Clean(change.Path))
		if change.Path == "" || filepath.IsAbs(change.Path) || clean == ".." || strings.HasPrefix(clean, "../") || clean != filepath.ToSlash(change.Path) || seen[clean] || (change.Delete && change.Content != "") {
			return ErrInvalidRequest
		}
		seen[clean] = true
		total += len(change.Path) + len(change.Content)
	}
	if total > 750_000 {
		return fmt.Errorf("%w: changes exceed size limit", ErrInvalidRequest)
	}
	return nil
}
