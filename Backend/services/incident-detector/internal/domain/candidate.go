package domain

import "time"

type Candidate struct {
	Service      string `json:"service"`
	Environment  string `json:"environment"`
	ErrorType    string `json:"errorType"`
	ErrorMessage string `json:"errorMessage"`
	TopFrame     string `json:"topFrame"`
	TraceID      string `json:"traceId"`
	Severity     string `json:"severity"`
}

type DetectedCandidate struct {
	Status      string    `json:"status"`
	Fingerprint string    `json:"fingerprint"`
	TraceID     string    `json:"traceId"`
	AcceptedAt  time.Time `json:"acceptedAt"`
	IncidentID  string    `json:"incidentId,omitempty"`
}
