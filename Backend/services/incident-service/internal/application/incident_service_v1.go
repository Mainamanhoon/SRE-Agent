package application

import (
	"context"
	"errors"
	"strings"

	"github.com/sre-agent/incident-service/internal/domain"
)

var (
	_ IncidentRecorder = (*IncidentServiceV1)(nil)
	_ IncidentReader   = (*IncidentServiceV1)(nil)

	ErrInvalidIncident   = errors.New("fingerprint, service, and environment are required")
	ErrInvalidIncidentID = errors.New("incident id is required")
	ErrIncidentNotFound  = errors.New("incident not found")
)

// IncidentServiceV1 is the first implementation of incident recording and reading.
type IncidentServiceV1 struct {
	repository IncidentRepository
}

func (service *IncidentServiceV1) Get(ctx context.Context, incidentID string) (domain.Incident, error) {
	if strings.TrimSpace(incidentID) == "" {
		return domain.Incident{}, ErrInvalidIncidentID
	}
	return service.repository.FindByID(ctx, incidentID)
}

func NewIncidentServiceV1(repository IncidentRepository) *IncidentServiceV1 {
	return &IncidentServiceV1{repository: repository}
}

func (service *IncidentServiceV1) Record(ctx context.Context, input domain.IncidentInput) (domain.Incident, error) {
	if strings.TrimSpace(input.Fingerprint) == "" || strings.TrimSpace(input.Service) == "" || strings.TrimSpace(input.Environment) == "" {
		return domain.Incident{}, ErrInvalidIncident
	}
	if strings.TrimSpace(input.Severity) == "" {
		input.Severity = "unknown"
	}
	return service.repository.Upsert(ctx, input)
}
