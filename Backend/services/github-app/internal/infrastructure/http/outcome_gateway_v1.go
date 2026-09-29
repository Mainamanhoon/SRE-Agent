package httpadapter

import (
	"bytes"
	"context"
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

type OutcomeGatewayV1 struct {
	repairRunURL string
	incidentURL  string
	token        string
	client       *http.Client
}

func NewOutcomeGatewayV1(repairRunURL, incidentURL, token string, client *http.Client) *OutcomeGatewayV1 {
	return &OutcomeGatewayV1{
		repairRunURL: strings.TrimRight(repairRunURL, "/"), incidentURL: strings.TrimRight(incidentURL, "/"),
		token: token, client: client,
	}
}

func (gateway *OutcomeGatewayV1) Get(ctx context.Context, repairRunID string) (domain.RepairRunReference, error) {
	var response struct {
		ID                string `json:"id"`
		IncidentID        string `json:"incidentId"`
		RepositoryOwner   string `json:"repositoryOwner"`
		RepositoryName    string `json:"repositoryName"`
		Status            string `json:"status"`
		PullRequestNumber int    `json:"pullRequestNumber"`
	}
	endpoint := gateway.repairRunURL + "/api/v1/repair-runs/" + url.PathEscape(repairRunID)
	if err := gateway.doJSON(ctx, http.MethodGet, endpoint, nil, &response); errors.Is(err, errNotFound) {
		return domain.RepairRunReference{}, application.ErrRepairRunNotFound
	} else if err != nil {
		return domain.RepairRunReference{}, err
	}
	return domain.RepairRunReference{
		ID: response.ID, IncidentID: response.IncidentID, RepositoryOwner: response.RepositoryOwner,
		RepositoryName: response.RepositoryName, Status: response.Status, PullRequestNumber: response.PullRequestNumber,
	}, nil
}

func (gateway *OutcomeGatewayV1) RecordEvent(ctx context.Context, event domain.RepairOutcomeEvent) error {
	request := map[string]any{
		"eventType": event.EventType, "stage": event.Stage, "outcome": event.Outcome,
		"idempotencyKey": event.IdempotencyKey, "metadata": event.Metadata,
	}
	if event.Status != "" {
		request["status"] = event.Status
	}
	endpoint := gateway.repairRunURL + "/api/v1/repair-runs/" + url.PathEscape(event.RepairRunID) + "/events"
	return gateway.doJSON(ctx, http.MethodPost, endpoint, request, nil)
}

func (gateway *OutcomeGatewayV1) UpdateStatus(ctx context.Context, incidentID, status string) error {
	endpoint := gateway.incidentURL + "/api/v1/incidents/" + url.PathEscape(incidentID) + "/status"
	return gateway.doJSON(ctx, http.MethodPatch, endpoint, map[string]string{"status": status}, nil)
}

var errNotFound = errors.New("downstream resource not found")

func (gateway *OutcomeGatewayV1) doJSON(ctx context.Context, method, endpoint string, input, output any) error {
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+gateway.token)
	request.Header.Set("Accept", "application/json")
	if input != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := gateway.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return errNotFound
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("outcome service returned HTTP %d", response.StatusCode)
	}
	if output == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<20))
		return nil
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 1<<20))
	if err = decoder.Decode(output); err != nil {
		return errors.New("outcome service returned an invalid response")
	}
	return nil
}
