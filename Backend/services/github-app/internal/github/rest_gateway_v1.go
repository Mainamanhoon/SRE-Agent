package github

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/sre-agent/github-app/internal/application"
	"github.com/sre-agent/github-app/internal/domain"
)

var _ application.GitHubGateway = (*RESTGatewayV1)(nil)

type RESTGatewayV1 struct {
	baseURL string
	tokens  application.InstallationTokenProvider
	client  *http.Client
}

func NewRESTGatewayV1(baseURL string, tokens application.InstallationTokenProvider, client *http.Client) *RESTGatewayV1 {
	return &RESTGatewayV1{baseURL: strings.TrimSuffix(baseURL, "/"), tokens: tokens, client: client}
}

func (gateway *RESTGatewayV1) Archive(ctx context.Context, installationID int64, repository, ref string) (domain.Archive, error) {
	token, err := gateway.tokens.Token(ctx, installationID)
	if err != nil {
		return domain.Archive{}, err
	}
	endpoint := fmt.Sprintf("%s/repos/%s/tarball/%s", gateway.baseURL, repository, url.PathEscape(ref))
	request, err := gateway.request(ctx, http.MethodGet, endpoint, token, nil)
	if err != nil {
		return domain.Archive{}, err
	}
	response, err := gateway.client.Do(request)
	if err != nil {
		return domain.Archive{}, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		if response.StatusCode == http.StatusNotFound {
			return domain.Archive{}, application.ErrRepositoryNotFound
		}
		return domain.Archive{}, fmt.Errorf("GitHub archive returned %d", response.StatusCode)
	}
	return domain.Archive{Body: response.Body, ContentLength: response.ContentLength, ContentType: response.Header.Get("Content-Type")}, nil
}

func (gateway *RESTGatewayV1) CreateBlob(ctx context.Context, installationID int64, repository, _ string, content string) (string, error) {
	var result struct {
		SHA string `json:"sha"`
	}
	err := gateway.json(ctx, http.MethodPost, installationID, repository, "/git/blobs", map[string]any{"content": base64.StdEncoding.EncodeToString([]byte(content)), "encoding": "base64"}, &result, http.StatusCreated)
	return result.SHA, err
}
func (gateway *RESTGatewayV1) GetCommitTree(ctx context.Context, installationID int64, repository, commit string) (string, error) {
	var result struct {
		Tree struct {
			SHA string `json:"sha"`
		} `json:"tree"`
	}
	err := gateway.json(ctx, http.MethodGet, installationID, repository, "/git/commits/"+url.PathEscape(commit), nil, &result, http.StatusOK)
	return result.Tree.SHA, err
}
func (gateway *RESTGatewayV1) CreateTree(ctx context.Context, installationID int64, repository, baseTree string, changes []domain.FileChange, blobs map[string]string) (string, error) {
	entries := make([]map[string]any, 0, len(changes))
	for _, change := range changes {
		entry := map[string]any{"path": change.Path, "mode": "100644", "type": "blob"}
		if change.Delete {
			entry["sha"] = nil
		} else {
			entry["sha"] = blobs[change.Path]
		}
		entries = append(entries, entry)
	}
	var result struct {
		SHA string `json:"sha"`
	}
	err := gateway.json(ctx, http.MethodPost, installationID, repository, "/git/trees", map[string]any{"base_tree": baseTree, "tree": entries}, &result, http.StatusCreated)
	return result.SHA, err
}
func (gateway *RESTGatewayV1) CreateCommit(ctx context.Context, installationID int64, repository, message, tree, parent string) (string, error) {
	var result struct {
		SHA string `json:"sha"`
	}
	err := gateway.json(ctx, http.MethodPost, installationID, repository, "/git/commits", map[string]any{"message": message, "tree": tree, "parents": []string{parent}}, &result, http.StatusCreated)
	return result.SHA, err
}
func (gateway *RESTGatewayV1) GetReference(ctx context.Context, installationID int64, repository, branch string) (string, bool, error) {
	var result struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	err := gateway.json(ctx, http.MethodGet, installationID, repository, "/git/ref/heads/"+url.PathEscape(branch), nil, &result, http.StatusOK)
	if errors.Is(err, application.ErrRepositoryNotFound) {
		return "", false, nil
	}
	return result.Object.SHA, err == nil, err
}
func (gateway *RESTGatewayV1) CommitMatchesRepair(ctx context.Context, installationID int64, repository, commit, parent, repairRunID string) (bool, error) {
	var result struct {
		Message string `json:"message"`
		Parents []struct {
			SHA string `json:"sha"`
		} `json:"parents"`
	}
	if err := gateway.json(ctx, http.MethodGet, installationID, repository, "/git/commits/"+url.PathEscape(commit), nil, &result, http.StatusOK); err != nil {
		return false, err
	}
	return strings.Contains(result.Message, "SRE-Agent-Repair-Run: "+repairRunID) && len(result.Parents) == 1 && result.Parents[0].SHA == parent, nil
}
func (gateway *RESTGatewayV1) CreateReference(ctx context.Context, installationID int64, repository, branch, commit string) error {
	return gateway.json(ctx, http.MethodPost, installationID, repository, "/git/refs", map[string]string{"ref": "refs/heads/" + branch, "sha": commit}, nil, http.StatusCreated)
}
func (gateway *RESTGatewayV1) FindPullRequest(ctx context.Context, installationID int64, repository, branch string) (int, string, bool, error) {
	owner := strings.SplitN(repository, "/", 2)[0]
	query := "?state=all&head=" + url.QueryEscape(owner+":"+branch) + "&per_page=1"
	var result []struct {
		Number int    `json:"number"`
		URL    string `json:"html_url"`
	}
	err := gateway.json(ctx, http.MethodGet, installationID, repository, "/pulls"+query, nil, &result, http.StatusOK)
	if err != nil || len(result) == 0 {
		return 0, "", false, err
	}
	return result[0].Number, result[0].URL, true, nil
}
func (gateway *RESTGatewayV1) CreateDraftPullRequest(ctx context.Context, installationID int64, repository, base, head, title, body string) (int, string, error) {
	var result struct {
		Number int    `json:"number"`
		URL    string `json:"html_url"`
	}
	err := gateway.json(ctx, http.MethodPost, installationID, repository, "/pulls", map[string]any{"base": base, "head": head, "title": title, "body": body, "draft": true}, &result, http.StatusCreated)
	return result.Number, result.URL, err
}

func (gateway *RESTGatewayV1) json(ctx context.Context, method string, installationID int64, repository, path string, input, output any, expected int) error {
	token, err := gateway.tokens.Token(ctx, installationID)
	if err != nil {
		return err
	}
	var body io.Reader
	if input != nil {
		payload, marshalErr := json.Marshal(input)
		if marshalErr != nil {
			return marshalErr
		}
		body = bytes.NewReader(payload)
	}
	request, err := gateway.request(ctx, method, gateway.baseURL+"/repos/"+repository+path, token, body)
	if err != nil {
		return err
	}
	response, err := gateway.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return err
	}
	if response.StatusCode != expected {
		if response.StatusCode == http.StatusNotFound {
			return application.ErrRepositoryNotFound
		}
		return fmt.Errorf("GitHub API returned %d", response.StatusCode)
	}
	if output != nil && len(payload) > 0 {
		return json.Unmarshal(payload, output)
	}
	return nil
}
func (gateway *RESTGatewayV1) request(ctx context.Context, method, endpoint, token string, body io.Reader) (*http.Request, error) {
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request, nil
}
