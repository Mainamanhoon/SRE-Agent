package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"runtime/debug"
	"strconv"
	"time"

	"github.com/sre-agent/repair-run-service/internal/application"
	"github.com/sre-agent/repair-run-service/internal/domain"
)

type UseCases interface {
	Create(context.Context, domain.CreateInput) (domain.RepairRun, error)
	Get(context.Context, string) (domain.RepairRun, error)
	List(context.Context, domain.ListQuery) (domain.RunPage, error)
	AppendEvent(context.Context, domain.AppendEventInput) (domain.RunEvent, error)
	ListEvents(context.Context, string, int64, int) (domain.EventPage, error)
	Update(context.Context, domain.UpdateInput) (domain.RepairRun, error)
}
type ReadinessProbe interface{ Ping(context.Context) error }

type HandlerDependencies struct {
	UseCases         UseCases
	Readiness        ReadinessProbe
	Authenticator    application.RequestAuthenticator
	Limiter          application.RequestLimiter
	Metrics          application.RepairRunMetrics
	ServiceVersion   string
	BodyLimitBytes   int64
	ReadinessTimeout time.Duration
}

func NewHandler(dependencies HandlerDependencies) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok", "service": "repair-run-service", "version": dependencies.ServiceVersion})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), dependencies.ReadinessTimeout)
		defer cancel()
		if dependencies.Readiness.Ping(ctx) != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /metrics", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = writer.Write([]byte(dependencies.Metrics.Prometheus()))
	})
	mux.HandleFunc("POST /api/v1/repair-runs", func(writer http.ResponseWriter, request *http.Request) {
		var input domain.CreateInput
		if !decodeJSON(writer, request, dependencies.BodyLimitBytes, &input) {
			dependencies.Metrics.Observe("rejected")
			return
		}
		run, err := dependencies.UseCases.Create(request.Context(), input)
		if writeError(writer, dependencies.Metrics, err) {
			return
		}
		dependencies.Metrics.Observe("created")
		writeJSON(writer, http.StatusAccepted, run)
	})
	mux.HandleFunc("GET /api/v1/repair-runs", func(writer http.ResponseWriter, request *http.Request) {
		query, valid := parseListQuery(request)
		if !valid {
			dependencies.Metrics.Observe("rejected")
			writeJSON(writer, 400, map[string]string{"code": "INVALID_QUERY"})
			return
		}
		page, err := dependencies.UseCases.List(request.Context(), query)
		if writeError(writer, dependencies.Metrics, err) {
			return
		}
		dependencies.Metrics.Observe("read")
		writeJSON(writer, http.StatusOK, page)
	})
	mux.HandleFunc("GET /api/v1/repair-runs/{repairRunID}", func(writer http.ResponseWriter, request *http.Request) {
		run, err := dependencies.UseCases.Get(request.Context(), request.PathValue("repairRunID"))
		if writeError(writer, dependencies.Metrics, err) {
			return
		}
		dependencies.Metrics.Observe("read")
		writeJSON(writer, http.StatusOK, run)
	})
	mux.HandleFunc("POST /api/v1/repair-runs/{repairRunID}/events", func(writer http.ResponseWriter, request *http.Request) {
		var input domain.AppendEventInput
		if !decodeJSON(writer, request, dependencies.BodyLimitBytes, &input) {
			dependencies.Metrics.Observe("rejected")
			return
		}
		input.RepairRunID = request.PathValue("repairRunID")
		event, err := dependencies.UseCases.AppendEvent(request.Context(), input)
		if writeError(writer, dependencies.Metrics, err) {
			return
		}
		dependencies.Metrics.Observe("event")
		writeJSON(writer, http.StatusAccepted, event)
	})
	mux.HandleFunc("GET /api/v1/repair-runs/{repairRunID}/events", func(writer http.ResponseWriter, request *http.Request) {
		afterID, err := optionalInt64(request.URL.Query().Get("afterId"))
		limit, limitErr := optionalInt(request.URL.Query().Get("limit"))
		if err != nil || limitErr != nil {
			dependencies.Metrics.Observe("rejected")
			writeJSON(writer, 400, map[string]string{"code": "INVALID_QUERY"})
			return
		}
		if limit == 0 {
			limit = 50
		}
		page, err := dependencies.UseCases.ListEvents(request.Context(), request.PathValue("repairRunID"), afterID, limit)
		if writeError(writer, dependencies.Metrics, err) {
			return
		}
		dependencies.Metrics.Observe("read")
		writeJSON(writer, http.StatusOK, page)
	})
	mux.HandleFunc("PATCH /api/v1/repair-runs/{repairRunID}", func(writer http.ResponseWriter, request *http.Request) {
		var input domain.UpdateInput
		if !decodeJSON(writer, request, dependencies.BodyLimitBytes, &input) {
			dependencies.Metrics.Observe("rejected")
			return
		}
		input.ID = request.PathValue("repairRunID")
		run, err := dependencies.UseCases.Update(request.Context(), input)
		if writeError(writer, dependencies.Metrics, err) {
			return
		}
		dependencies.Metrics.Observe("updated")
		writeJSON(writer, http.StatusOK, run)
	})
	return recoverPanic(securityHeaders(authenticate(rateLimit(mux, dependencies.Limiter, dependencies.Metrics), dependencies.Authenticator)))
}

func parseListQuery(request *http.Request) (domain.ListQuery, bool) {
	values := request.URL.Query()
	query := domain.ListQuery{Limit: 50, Status: values.Get("status"), IncidentID: values.Get("incidentId"),
		Repository: values.Get("repository"), Cursor: values.Get("cursor")}
	if raw := values.Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return query, false
		}
		query.Limit = value
	}
	if query.Limit < 1 || query.Limit > 100 {
		return query, false
	}
	if raw := values.Get("from"); raw != "" {
		value, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return query, false
		}
		query.From = &value
	}
	if raw := values.Get("to"); raw != "" {
		value, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return query, false
		}
		query.To = &value
	}
	return query, true
}

func optionalInt(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	return strconv.Atoi(raw)
}
func optionalInt64(raw string) (int64, error) {
	if raw == "" {
		return 0, nil
	}
	return strconv.ParseInt(raw, 10, 64)
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, maxBytes int64, target any) bool {
	request.Body = http.MaxBytesReader(writer, request.Body, maxBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeJSON(writer, 400, map[string]string{"code": "INVALID_JSON"})
		return false
	}
	if decoder.Decode(new(any)) != io.EOF {
		writeJSON(writer, 400, map[string]string{"code": "INVALID_JSON"})
		return false
	}
	return true
}

func writeError(writer http.ResponseWriter, metrics application.RepairRunMetrics, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, application.ErrInvalidInput), errors.Is(err, application.ErrMetadata):
		metrics.Observe("rejected")
		writeJSON(writer, 400, map[string]string{"code": "INVALID_REQUEST"})
	case errors.Is(err, application.ErrNotFound):
		metrics.Observe("read")
		writeJSON(writer, 404, map[string]string{"code": "REPAIR_RUN_NOT_FOUND"})
	case errors.Is(err, application.ErrIdempotencyConflict), errors.Is(err, application.ErrConcurrentUpdate), errors.Is(err, application.ErrInvalidTransition):
		metrics.Observe("rejected")
		writeJSON(writer, 409, map[string]string{"code": "REPAIR_RUN_CONFLICT"})
	default:
		metrics.Observe("failed")
		writeJSON(writer, 500, map[string]string{"code": "REPAIR_RUN_OPERATION_FAILED"})
	}
	return true
}

func authenticate(next http.Handler, authenticator application.RequestAuthenticator) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/health" || request.URL.Path == "/ready" || request.URL.Path == "/metrics" {
			next.ServeHTTP(writer, request)
			return
		}
		if !authenticator.Authenticate(request.Header.Get("Authorization")) {
			writeJSON(writer, 401, map[string]string{"code": "UNAUTHORIZED"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func rateLimit(next http.Handler, limiter application.RequestLimiter, metrics application.RepairRunMetrics) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/health" || request.URL.Path == "/ready" || request.URL.Path == "/metrics" {
			next.ServeHTTP(writer, request)
			return
		}
		if !limiter.Allow() {
			metrics.Observe("rejected")
			writer.Header().Set("retry-after", "1")
			writeJSON(writer, 429, map[string]string{"code": "RATE_LIMIT_EXCEEDED"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("cache-control", "no-store")
		writer.Header().Set("x-content-type-options", "nosniff")
		writer.Header().Set("x-frame-options", "DENY")
		writer.Header().Set("referrer-policy", "no-referrer")
		next.ServeHTTP(writer, request)
	})
}
func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer func() {
			if recover() != nil {
				_ = debug.Stack()
				writeJSON(writer, 500, map[string]string{"code": "INTERNAL_ERROR"})
			}
		}()
		next.ServeHTTP(writer, request)
	})
}
func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("content-type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}
