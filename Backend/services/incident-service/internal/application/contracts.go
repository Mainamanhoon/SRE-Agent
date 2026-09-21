package application

import (
	"context"

	"github.com/sre-agent/incident-service/internal/domain"
)

// IncidentRecorder is the application contract used by inbound transports.
type IncidentRecorder interface {
	Record(context.Context, domain.IncidentInput) (domain.Incident, error)
}

// IncidentRepository is the persistence contract implemented by storage adapters.
type IncidentRepository interface {
	Upsert(context.Context, domain.IncidentInput) (domain.Incident, error)
}

// ReadinessProbe is deliberately separate from persistence operations.
type ReadinessProbe interface {
	Ping(context.Context) error
}
