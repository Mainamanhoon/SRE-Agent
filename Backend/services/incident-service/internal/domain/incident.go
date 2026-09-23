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
