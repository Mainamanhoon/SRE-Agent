package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sre-agent/repair-run-service/internal/application"
	"github.com/sre-agent/repair-run-service/internal/domain"
)

type testUseCases struct {
	created domain.CreateInput
	event   domain.AppendEventInput
	list    domain.ListQuery
	getErr  error
}

func (useCases *testUseCases) Create(_ context.Context, input domain.CreateInput) (domain.RepairRun, error) {
	useCases.created = input
	return domain.RepairRun{ID: input.ID, Status: "queued", Version: 1}, nil
}
func (useCases *testUseCases) Get(_ context.Context, id string) (domain.RepairRun, error) {
	if useCases.getErr != nil {
		return domain.RepairRun{}, useCases.getErr
	}
	return domain.RepairRun{ID: id}, nil
}
func (useCases *testUseCases) List(_ context.Context, query domain.ListQuery) (domain.RunPage, error) {
	useCases.list = query
	return domain.RunPage{}, nil
}
func (useCases *testUseCases) AppendEvent(_ context.Context, input domain.AppendEventInput) (domain.RunEvent, error) {
	useCases.event = input
	return domain.RunEvent{RepairRunID: input.RepairRunID, EventType: input.EventType}, nil
}
func (*testUseCases) ListEvents(context.Context, string, int64, int) (domain.EventPage, error) {
	return domain.EventPage{}, nil
}
func (*testUseCases) Update(context.Context, domain.UpdateInput) (domain.RepairRun, error) {
	return domain.RepairRun{}, nil
}

type testAuth struct{ allow bool }

func (auth testAuth) Authenticate(string) bool { return auth.allow }

type testLimit struct{ allow bool }

func (limit testLimit) Allow() bool { return limit.allow }

type testMetrics struct{}

func (testMetrics) Observe(string)             {}
func (testMetrics) Prometheus() string         { return "" }
func (testMetrics) Ping(context.Context) error { return nil }

func testHandler(useCases UseCases, authenticated bool, admitted bool) http.Handler {
	return NewHandler(HandlerDependencies{
		UseCases: useCases, Readiness: testMetrics{}, Authenticator: testAuth{allow: authenticated},
		Limiter: testLimit{allow: admitted}, Metrics: testMetrics{}, ServiceVersion: "test",
		BodyLimitBytes: 4096, ReadinessTimeout: time.Second,
	})
}

func TestRepairRunHandlerRequiresAuthentication(t *testing.T) {
	response := httptest.NewRecorder()
	testHandler(&testUseCases{}, false, true).ServeHTTP(response,
		httptest.NewRequest(http.MethodGet, "/api/v1/repair-runs/run-1", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized, got %d", response.Code)
	}
}

func TestCreateAndAppendEventDecodeContract(t *testing.T) {
	useCases := &testUseCases{}
	handler := testHandler(useCases, true, true)
	create := httptest.NewRequest(http.MethodPost, "/api/v1/repair-runs",
		strings.NewReader(`{"id":"run-1","incidentId":"8cb1bb40-215d-4b22-92b2-b080dddb3166","repositoryOwner":"owner","repositoryName":"service","expectedCommit":"abcdef1234567","toolchain":"node"}`))
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, create)
	if createResponse.Code != http.StatusAccepted || useCases.created.ID != "run-1" {
		t.Fatalf("unexpected create response %d: %s", createResponse.Code, createResponse.Body.String())
	}
	event := httptest.NewRequest(http.MethodPost, "/api/v1/repair-runs/run-1/events",
		strings.NewReader(`{"eventType":"diagnosis_completed","stage":"diagnosis","outcome":"succeeded","status":"investigating","idempotencyKey":"diagnosis-v1","metadata":{"summary":"found the cause"}}`))
	eventResponse := httptest.NewRecorder()
	handler.ServeHTTP(eventResponse, event)
	if eventResponse.Code != http.StatusAccepted || useCases.event.RepairRunID != "run-1" || useCases.event.IdempotencyKey != "diagnosis-v1" {
		t.Fatalf("unexpected event response %d: %s", eventResponse.Code, eventResponse.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(eventResponse.Body.Bytes(), &result); err != nil || result["eventType"] != "diagnosis_completed" {
		t.Fatalf("unexpected event payload %v, %v", result, err)
	}
}

func TestListRejectsInvalidLimitAndServesSafeQuery(t *testing.T) {
	useCases := &testUseCases{}
	handler := testHandler(useCases, true, true)
	bad := httptest.NewRecorder()
	handler.ServeHTTP(bad, httptest.NewRequest(http.MethodGet, "/api/v1/repair-runs?limit=1000", nil))
	if bad.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid limit rejection, got %d", bad.Code)
	}
	good := httptest.NewRecorder()
	handler.ServeHTTP(good, httptest.NewRequest(http.MethodGet, "/api/v1/repair-runs?limit=20&repository=owner/service", nil))
	if good.Code != http.StatusOK || useCases.list.Repository != "owner/service" {
		t.Fatalf("expected list result, got %d %s", good.Code, good.Body.String())
	}
}

func TestSafeNotFoundAndConflictResponses(t *testing.T) {
	for _, test := range []struct {
		name string
		err  error
		code int
	}{
		{name: "not found", err: application.ErrNotFound, code: http.StatusNotFound},
		{name: "idempotency", err: application.ErrIdempotencyConflict, code: http.StatusConflict},
	} {
		t.Run(test.name, func(t *testing.T) {
			useCases := &testUseCases{getErr: test.err}
			response := httptest.NewRecorder()
			testHandler(useCases, true, true).ServeHTTP(response,
				httptest.NewRequest(http.MethodGet, "/api/v1/repair-runs/run-1", nil))
			if response.Code != test.code || strings.Contains(response.Body.String(), test.err.Error()) {
				t.Fatalf("unsafe or incorrect error response %d %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestRateLimitIsApplied(t *testing.T) {
	response := httptest.NewRecorder()
	testHandler(&testUseCases{}, true, false).ServeHTTP(response,
		httptest.NewRequest(http.MethodGet, "/api/v1/repair-runs", nil))
	if response.Code != http.StatusTooManyRequests || response.Header().Get("retry-after") != "1" {
		t.Fatalf("expected rate limit response, got %d", response.Code)
	}
}
