package application

import (
	"context"

	"github.com/sre-agent/incident-service/internal/domain"
)

// IncidentRecorder is the application contract used by inbound transports.
type IncidentRecorder interface {
	Record(context.Context, domain.IncidentInput) (domain.Incident, error)
}

// IncidentReader is separate from writes so read-only consumers depend on the narrow capability.
type IncidentReader interface {
	Get(context.Context, string) (domain.Incident, error)
}

// IncidentWriter is the persistence capability needed by incident recording.
type IncidentWriter interface {
	Upsert(context.Context, domain.IncidentInput) (domain.Incident, error)
}

// IncidentFinder is the persistence capability needed by incident reads.
type IncidentFinder interface {
	FindByID(context.Context, string) (domain.Incident, error)
}

// IncidentRepository combines the capabilities required by IncidentServiceV1.
type IncidentRepository interface {
	IncidentWriter
	IncidentFinder
}

// ReadinessProbe is deliberately separate from persistence operations.
type ReadinessProbe interface {
	Ping(context.Context) error
}
