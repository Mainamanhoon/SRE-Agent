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
	"time"

	"github.com/sre-agent/sandbox-controller/internal/application"
	"github.com/sre-agent/sandbox-controller/internal/domain"
)

type HandlerDependencies struct {
	Creator          application.SandboxCreator
	Reader           application.SandboxReader
	Deleter          application.SandboxDeleter
	Readiness        application.ReadinessProbe
	Authenticator    application.RequestAuthenticator
	Limiter          application.RequestLimiter
	Metrics          application.SandboxMetrics
	ServiceVersion   string
	BodyLimitBytes   int64
	ReadinessTimeout time.Duration
}

func NewHandler(dependencies HandlerDependencies) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok", "service": "sandbox-controller", "version": dependencies.ServiceVersion})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), dependencies.ReadinessTimeout)
		defer cancel()
		if err := dependencies.Readiness.Ready(ctx); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /metrics", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = writer.Write([]byte(dependencies.Metrics.Prometheus()))
	})
	mux.HandleFunc("POST /api/v1/sandboxes", func(writer http.ResponseWriter, request *http.Request) { handleCreate(dependencies, writer, request) })
	mux.HandleFunc("GET /api/v1/sandboxes/{repairRunID}", func(writer http.ResponseWriter, request *http.Request) { handleGet(dependencies, writer, request) })
	mux.HandleFunc("GET /api/v1/sandboxes/{repairRunID}/result", func(writer http.ResponseWriter, request *http.Request) { handleResult(dependencies, writer, request) })
	mux.HandleFunc("DELETE /api/v1/sandboxes/{repairRunID}", func(writer http.ResponseWriter, request *http.Request) { handleDelete(dependencies, writer, request) })
	return recoverPanic(securityHeaders(authenticate(rateLimit(mux, dependencies.Limiter, dependencies.Metrics), dependencies.Authenticator)))
}

func handleCreate(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	var input domain.CreateSandboxInput
	if !decodeJSON(writer, request, dependencies.BodyLimitBytes, &input) {
		dependencies.Metrics.Observe("rejected")
		return
	}
	sandbox, err := dependencies.Creator.Create(request.Context(), input)
	if errors.Is(err, application.ErrInvalidSandboxRequest) || errors.Is(err, application.ErrUnsupportedToolchain) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	if errors.Is(err, application.ErrSandboxConflict) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	if err != nil {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "sandbox creation failed"})
		return
	}
	dependencies.Metrics.Observe("created")
	writeJSON(writer, http.StatusAccepted, sandbox)
}

func handleGet(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	sandbox, err := dependencies.Reader.Get(request.Context(), request.PathValue("repairRunID"))
	if handleReadError(dependencies, writer, err) {
		return
	}
	dependencies.Metrics.Observe("read")
	writeJSON(writer, http.StatusOK, sandbox)
}

func handleResult(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	result, err := dependencies.Reader.Result(request.Context(), request.PathValue("repairRunID"))
	if errors.Is(err, application.ErrSandboxNotComplete) {
		writeJSON(writer, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	if errors.Is(err, application.ErrSandboxResultInvalid) {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	if handleReadError(dependencies, writer, err) {
		return
	}
	dependencies.Metrics.Observe("read")
	writeJSON(writer, http.StatusOK, result)
}

func handleDelete(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	err := dependencies.Deleter.Delete(request.Context(), request.PathValue("repairRunID"))
	if errors.Is(err, application.ErrInvalidSandboxRequest) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	if err != nil {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "sandbox deletion failed"})
		return
	}
	dependencies.Metrics.Observe("deleted")
	writer.WriteHeader(http.StatusNoContent)
}

func handleReadError(dependencies HandlerDependencies, writer http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, application.ErrInvalidSandboxRequest) {
		dependencies.Metrics.Observe("rejected")
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return true
	}
	if errors.Is(err, application.ErrSandboxNotFound) {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": err.Error()})
		return true
	}
	dependencies.Metrics.Observe("failed")
	writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "sandbox lookup failed"})
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
func authenticate(next http.Handler, auth application.RequestAuthenticator) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !publicPath(request.URL.Path) && !auth.Authenticate(request.Header.Get("Authorization")) {
			writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "authentication is required"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func rateLimit(next http.Handler, limiter application.RequestLimiter, metrics application.SandboxMetrics) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !publicPath(request.URL.Path) && !limiter.Allow() {
			metrics.Observe("rejected")
			writer.Header().Set("Retry-After", "1")
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"error": "request rate limit exceeded"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func publicPath(path string) bool { return path == "/health" || path == "/ready" || path == "/metrics" }
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
