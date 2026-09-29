package httpadapter

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sre-agent/github-app/internal/application"
	"github.com/sre-agent/github-app/internal/domain"
)

func TestOutcomeGatewayUsesBearerAuthAndIdempotentEventKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer internal-token" {
			t.Errorf("missing internal auth header")
		}
		switch {
		case request.Method == http.MethodGet && request.URL.Path == "/api/v1/repair-runs/run-1":
			_, _ = writer.Write([]byte(`{"id":"run-1","incidentId":"incident-1","repositoryOwner":"example","repositoryName":"service","status":"awaiting_review","pullRequestNumber":17}`))
		case request.Method == http.MethodPost && request.URL.Path == "/api/v1/repair-runs/run-1/events":
			var payload map[string]any
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				t.Errorf("invalid event body: %v", err)
			}
			if payload["idempotencyKey"] != "github-delivery:delivery-1" || payload["eventType"] != "pull_request_merged" {
				t.Errorf("event was not idempotency-keyed: %#v", payload)
			}
			writer.WriteHeader(http.StatusAccepted)
		case request.Method == http.MethodPatch && request.URL.Path == "/api/v1/incidents/incident-1/status":
			var payload map[string]string
			_ = json.NewDecoder(request.Body).Decode(&payload)
			if payload["status"] != "resolved" {
				t.Errorf("unexpected incident status update: %#v", payload)
			}
			writer.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	gateway := NewOutcomeGatewayV1(server.URL, server.URL, "internal-token", server.Client())
	run, err := gateway.Get(context.Background(), "run-1")
	if err != nil || run.IncidentID != "incident-1" || run.PullRequestNumber != 17 {
		t.Fatalf("unexpected run response %#v, %v", run, err)
	}
	if err = gateway.RecordEvent(context.Background(), domain.RepairOutcomeEvent{
		RepairRunID: "run-1", EventType: "pull_request_merged", Stage: "github_webhook", Outcome: "merged",
		Status: "resolved", IdempotencyKey: "github-delivery:delivery-1", Metadata: map[string]any{"mergeCommit": "abcdef1234567"},
	}); err != nil {
		t.Fatal(err)
	}
	if err = gateway.UpdateStatus(context.Background(), "incident-1", "resolved"); err != nil {
		t.Fatal(err)
	}
}

func TestOutcomeGatewayMapsRepairRunNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) { writer.WriteHeader(http.StatusNotFound) }))
	defer server.Close()
	gateway := NewOutcomeGatewayV1(server.URL, server.URL, "internal-token", server.Client())
	_, err := gateway.Get(context.Background(), "missing")
	if !errors.Is(err, application.ErrRepairRunNotFound) {
		t.Fatalf("expected a typed not-found error, got %v", err)
	}
}

func TestOutcomeGatewayNeverIncludesDownstreamBodyInError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusInternalServerError)
		_, _ = writer.Write([]byte("private downstream data"))
	}))
	defer server.Close()
	gateway := NewOutcomeGatewayV1(server.URL, server.URL, "internal-token", server.Client())
	err := gateway.UpdateStatus(context.Background(), "incident-1", "resolved")
	if err == nil || strings.Contains(err.Error(), "private downstream data") {
		t.Fatalf("downstream response body leaked into error: %v", err)
	}
}
