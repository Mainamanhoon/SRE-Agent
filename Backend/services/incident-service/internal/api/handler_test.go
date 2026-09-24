package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sre-agent/incident-service/internal/application"
	"github.com/sre-agent/incident-service/internal/domain"
	"github.com/sre-agent/incident-service/internal/metrics"
)

const testIncidentID = "11111111-1111-4111-8111-111111111111"

type stubIncidentService struct{ incident domain.Incident }

func (service *stubIncidentService) Record(context.Context, domain.IncidentInput) (domain.Incident, error) {
	return service.incident, nil
}
func (service *stubIncidentService) Get(context.Context, string) (domain.Incident, error) {
	return service.incident, nil
}
func (service *stubIncidentService) List(context.Context, application.ListIncidentsRequest) (domain.IncidentPage, error) {
	return domain.IncidentPage{Items: []domain.Incident{service.incident}}, nil
}
func (service *stubIncidentService) ListOccurrences(context.Context, string, int) ([]domain.IncidentOccurrence, error) {
	return []domain.IncidentOccurrence{}, nil
}
func (service *stubIncidentService) UpdateStatus(_ context.Context, _ string, status string) (domain.Incident, error) {
	service.incident.Status = status
	return service.incident, nil
}

type stubReadiness struct{}

func (*stubReadiness) Ping(context.Context) error { return nil }

type stubAuth bool

func (auth stubAuth) Authenticate(string) bool { return bool(auth) }

type stubLimiter bool

func (limiter stubLimiter) Allow() bool { return bool(limiter) }

func TestGetIncident(t *testing.T) {
	service := &stubIncidentService{incident: domain.Incident{ID: testIncidentID, Service: "checkout"}}
	handler := testHandler(service, true, true)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/incidents/"+testIncidentID, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
}

func TestAuthenticationAndRateLimit(t *testing.T) {
	service := &stubIncidentService{}
	response := httptest.NewRecorder()
	testHandler(service, false, true).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/incidents", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
	response = httptest.NewRecorder()
	testHandler(service, true, false).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/incidents", nil))
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", response.Code)
	}
}

func TestUpdateStatus(t *testing.T) {
	service := &stubIncidentService{incident: domain.Incident{ID: testIncidentID, Status: "open"}}
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/incidents/"+testIncidentID+"/status", strings.NewReader(`{"status":"investigating"}`))
	response := httptest.NewRecorder()
	testHandler(service, true, true).ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
}

func testHandler(service *stubIncidentService, authenticated, admitted bool) http.Handler {
	return NewHandler(HandlerDependencies{Recorder: service, Reader: service, Statuses: service, Readiness: &stubReadiness{}, Authenticator: stubAuth(authenticated), Limiter: stubLimiter(admitted), Metrics: &metrics.IncidentMetricsV1{}, ServiceVersion: "test", BodyLimitBytes: 1 << 20, ReadinessTimeout: time.Second})
}
