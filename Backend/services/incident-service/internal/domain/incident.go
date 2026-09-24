package domain

import "time"

type IncidentInput struct {
	Fingerprint  string `json:"fingerprint"`
	Service      string `json:"service"`
	Environment  string `json:"environment"`
	Severity     string `json:"severity"`
	TraceID      string `json:"traceId"`
	ErrorSummary string `json:"errorSummary"`
}

type Incident struct {
	ID              string    `json:"id"`
	Fingerprint     string    `json:"fingerprint"`
	Service         string    `json:"service"`
	Environment     string    `json:"environment"`
	Severity        string    `json:"severity"`
	Status          string    `json:"status"`
	TraceID         string    `json:"traceId,omitempty"`
	ErrorSummary    string    `json:"errorSummary,omitempty"`
	OccurrenceCount int64     `json:"occurrenceCount"`
	FirstSeenAt     time.Time `json:"firstSeenAt"`
	LastSeenAt      time.Time `json:"lastSeenAt"`
}

type IncidentOccurrence struct {
	ID           int64     `json:"id"`
	IncidentID   string    `json:"incidentId"`
	Severity     string    `json:"severity"`
	TraceID      string    `json:"traceId,omitempty"`
	ErrorSummary string    `json:"errorSummary,omitempty"`
	ObservedAt   time.Time `json:"observedAt"`
}

type IncidentListQuery struct {
	Status         string
	Service        string
	Limit          int
	BeforeLastSeen time.Time
	BeforeID       string
}

type IncidentPage struct {
	Items      []Incident `json:"items"`
	NextCursor string     `json:"nextCursor,omitempty"`
}

type IncidentStatusUpdate struct {
	Status string `json:"status"`
}
