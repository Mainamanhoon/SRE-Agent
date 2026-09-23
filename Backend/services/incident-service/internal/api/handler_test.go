package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sre-agent/incident-service/internal/domain"
)

type stubIncidentService struct {
	incident domain.Incident
}

func (service *stubIncidentService) Record(_ context.Context, _ domain.IncidentInput) (domain.Incident, error) {
	return service.incident, nil
}

func (service *stubIncidentService) Get(_ context.Context, _ string) (domain.Incident, error) {
	return service.incident, nil
}

type stubReadiness struct{}

func (*stubReadiness) Ping(context.Context) error { return nil }

func TestGetIncident(t *testing.T) {
	service := &stubIncidentService{incident: domain.Incident{ID: "incident-1", Service: "checkout"}}
	handler := NewHandler(service, service, &stubReadiness{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/v1/incidents/incident-1", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
}
