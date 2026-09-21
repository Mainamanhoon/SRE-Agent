package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/domain"
)

const maxCandidateBodyBytes = 1 << 20

func NewHandler(detector application.CandidateDetector, serviceName, serviceVersion string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]any{
			"status":  "ok",
			"service": serviceName,
			"version": serviceVersion,
		})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("POST /api/v1/candidates", func(writer http.ResponseWriter, request *http.Request) {
		handleCandidate(detector, writer, request)
	})
	return mux
}

func handleCandidate(detector application.CandidateDetector, writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, maxCandidateBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()

	var input domain.Candidate
	if err := decoder.Decode(&input); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid candidate payload"})
		return
	}
	detected, err := detector.Detect(request.Context(), input)
	if errors.Is(err, application.ErrInvalidCandidate) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "service and errorType are required"})
		return
	}
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "candidate detection failed"})
		return
	}
	writeJSON(writer, http.StatusAccepted, detected)
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
