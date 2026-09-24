package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strconv"
	"time"

	"github.com/sre-agent/incident-service/internal/application"
	"github.com/sre-agent/incident-service/internal/domain"
)

type HandlerDependencies struct {
	Recorder         application.IncidentRecorder
	Reader           application.IncidentReader
	Statuses         application.IncidentStatusManager
	Readiness        application.ReadinessProbe
	Authenticator    application.RequestAuthenticator
	Limiter          application.RequestLimiter
	Metrics          application.IncidentMetrics
	ServiceVersion   string
	BodyLimitBytes   int64
	ReadinessTimeout time.Duration
}

func NewHandler(dependencies HandlerDependencies) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok", "service": "incident-service", "version": dependencies.ServiceVersion})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), dependencies.ReadinessTimeout)
		defer cancel()
		if err := dependencies.Readiness.Ping(ctx); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /metrics", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = writer.Write([]byte(dependencies.Metrics.Prometheus()))
	})
	mux.HandleFunc("POST /api/v1/incidents", func(writer http.ResponseWriter, request *http.Request) { handleRecord(dependencies, writer, request) })
	mux.HandleFunc("GET /api/v1/incidents", func(writer http.ResponseWriter, request *http.Request) { handleList(dependencies, writer, request) })
	mux.HandleFunc("GET /api/v1/incidents/{incidentID}", func(writer http.ResponseWriter, request *http.Request) { handleGet(dependencies, writer, request) })
	mux.HandleFunc("GET /api/v1/incidents/{incidentID}/occurrences", func(writer http.ResponseWriter, request *http.Request) {
		handleOccurrences(dependencies, writer, request)
	})
	mux.HandleFunc("PATCH /api/v1/incidents/{incidentID}/status", func(writer http.ResponseWriter, request *http.Request) { handleStatus(dependencies, writer, request) })
	return recoverPanic(securityHeaders(authenticate(rateLimit(mux, dependencies.Limiter, dependencies.Metrics), dependencies.Authenticator)))
}

func handleRecord(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	var input domain.IncidentInput
	if !decodeJSON(writer, request, dependencies.BodyLimitBytes, &input) {
		dependencies.Metrics.Observe("rejected")
		return
	}
	incident, err := dependencies.Recorder.Record(request.Context(), input)
	if errors.Is(err, application.ErrInvalidIncident) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "fingerprint, service, and environment are required"})
		return
	}
	if err != nil {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "incident persistence failed"})
		return
	}
	dependencies.Metrics.Observe("recorded")
	writeJSON(writer, http.StatusCreated, incident)
}

func handleGet(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	incident, err := dependencies.Reader.Get(request.Context(), request.PathValue("incidentID"))
	if handleReadError(dependencies, writer, err) {
		return
	}
	dependencies.Metrics.Observe("read")
	writeJSON(writer, http.StatusOK, incident)
}

func handleList(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	limit, err := optionalInteger(request.URL.Query().Get("limit"))
	if err != nil {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid list query"})
		return
	}
	page, err := dependencies.Reader.List(request.Context(), application.ListIncidentsRequest{Status: request.URL.Query().Get("status"), Service: request.URL.Query().Get("service"), Limit: limit, Cursor: request.URL.Query().Get("cursor")})
	if errors.Is(err, application.ErrInvalidListQuery) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid list query"})
		return
	}
	if err != nil {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "incident list failed"})
		return
	}
	dependencies.Metrics.Observe("read")
	writeJSON(writer, http.StatusOK, page)
}

func handleOccurrences(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	limit, err := optionalInteger(request.URL.Query().Get("limit"))
	if err != nil {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid occurrence query"})
		return
	}
	items, err := dependencies.Reader.ListOccurrences(request.Context(), request.PathValue("incidentID"), limit)
	if errors.Is(err, application.ErrInvalidIncidentID) || errors.Is(err, application.ErrInvalidListQuery) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid occurrence query"})
		return
	}
	if err != nil {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "occurrence lookup failed"})
		return
	}
	dependencies.Metrics.Observe("read")
	writeJSON(writer, http.StatusOK, map[string]any{"items": items})
}

func handleStatus(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	var input domain.IncidentStatusUpdate
	if !decodeJSON(writer, request, dependencies.BodyLimitBytes, &input) {
		dependencies.Metrics.Observe("rejected")
		return
	}
	incident, err := dependencies.Statuses.UpdateStatus(request.Context(), request.PathValue("incidentID"), input.Status)
	if errors.Is(err, application.ErrInvalidIncidentID) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "invalid incident id"})
		return
	}
	if errors.Is(err, application.ErrIncidentNotFound) {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": "incident not found"})
		return
	}
	if errors.Is(err, application.ErrInvalidStatusTransition) || errors.Is(err, application.ErrConcurrentUpdate) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusConflict, map[string]string{"error": "invalid or concurrent status transition"})
		return
	}
	if err != nil {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "status update failed"})
		return
	}
	dependencies.Metrics.Observe("updated")
	writeJSON(writer, http.StatusOK, incident)
}

func handleReadError(dependencies HandlerDependencies, writer http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, application.ErrInvalidIncidentID) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "invalid incident id"})
		return true
	}
	if errors.Is(err, application.ErrIncidentNotFound) {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": "incident not found"})
		return true
	}
	dependencies.Metrics.Observe("failed")
	writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "incident lookup failed"})
	return true
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, limit int64, target any) bool {
	request.Body = http.MaxBytesReader(writer, request.Body, limit)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid request payload"})
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid request payload"})
		return false
	}
	return true
}

func optionalInteger(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	return strconv.Atoi(raw)
}
func authenticate(next http.Handler, auth application.RequestAuthenticator) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/health" && request.URL.Path != "/ready" && request.URL.Path != "/metrics" && !auth.Authenticate(request.Header.Get("Authorization")) {
			writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "authentication is required"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func rateLimit(next http.Handler, limiter application.RequestLimiter, metrics application.IncidentMetrics) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/health" && request.URL.Path != "/ready" && request.URL.Path != "/metrics" && !limiter.Allow() {
			metrics.Observe("rejected")
			writer.Header().Set("Retry-After", "1")
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"error": "request rate limit exceeded"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("X-Frame-Options", "DENY")
		writer.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(writer, request)
	})
}
func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("request panic", "error", fmt.Sprint(recovered), "stack", string(debug.Stack()))
				writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			}
		}()
		next.ServeHTTP(writer, request)
	})
}
func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
