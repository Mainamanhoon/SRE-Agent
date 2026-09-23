package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/sre-agent/incident-service/internal/application"
	"github.com/sre-agent/incident-service/internal/domain"
)

const maxIncidentBodyBytes = 1 << 20

func NewHandler(recorder application.IncidentRecorder, reader application.IncidentReader, readiness application.ReadinessProbe, serviceVersion string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "incident-service",
			"version": serviceVersion,
		})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
		defer cancel()
		if err := readiness.Ping(ctx); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("POST /api/v1/incidents", func(writer http.ResponseWriter, request *http.Request) {
		handleRecord(recorder, writer, request)
	})
	mux.HandleFunc("GET /api/v1/incidents/{incidentID}", func(writer http.ResponseWriter, request *http.Request) {
		handleGet(reader, writer, request)
	})
	return mux
}

func handleGet(reader application.IncidentReader, writer http.ResponseWriter, request *http.Request) {
	incident, err := reader.Get(request.Context(), request.PathValue("incidentID"))
	if errors.Is(err, application.ErrInvalidIncidentID) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "incident id is required"})
		return
	}
	if errors.Is(err, application.ErrIncidentNotFound) {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": "incident not found"})
		return
	}
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "incident lookup failed"})
		return
	}
	writeJSON(writer, http.StatusOK, incident)
}

func handleRecord(recorder application.IncidentRecorder, writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, maxIncidentBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var input domain.IncidentInput
	if err := decoder.Decode(&input); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid incident payload"})
		return
	}
	incident, err := recorder.Record(request.Context(), input)
	if errors.Is(err, application.ErrInvalidIncident) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "fingerprint, service, and environment are required"})
		return
	}
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "incident persistence failed"})
		return
	}
	writeJSON(writer, http.StatusCreated, incident)
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
