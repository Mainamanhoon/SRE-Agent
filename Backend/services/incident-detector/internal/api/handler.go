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

	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/domain"
)

type HandlerDependencies struct {
	Detector         application.CandidateDetector
	Readiness        application.ReadinessProbe
	Authenticator    application.RequestAuthenticator
	Limiter          application.RequestLimiter
	Metrics          application.CandidateMetrics
	ServiceName      string
	ServiceVersion   string
	BodyLimitBytes   int64
	ReadinessTimeout time.Duration
}

func NewHandler(dependencies HandlerDependencies) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]any{"status": "ok", "service": dependencies.ServiceName, "version": dependencies.ServiceVersion})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), dependencies.ReadinessTimeout)
		defer cancel()
		if err := dependencies.Readiness.Check(ctx); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /metrics", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = writer.Write([]byte(dependencies.Metrics.Prometheus()))
	})
	mux.HandleFunc("POST /api/v1/candidates", func(writer http.ResponseWriter, request *http.Request) {
		if !dependencies.Limiter.Allow() {
			dependencies.Metrics.Observe("limited")
			writer.Header().Set("Retry-After", "1")
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"error": "request rate limit exceeded"})
			return
		}
		handleCandidate(dependencies, writer, request)
	})
	return recoverPanic(securityHeaders(authenticate(mux, dependencies.Authenticator)))
}

func handleCandidate(dependencies HandlerDependencies, writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, dependencies.BodyLimitBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var input domain.Candidate
	if err := decoder.Decode(&input); err != nil {
		dependencies.Metrics.Observe("invalid")
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid candidate payload"})
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		dependencies.Metrics.Observe("invalid")
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid candidate payload"})
		return
	}
	detected, err := dependencies.Detector.Detect(request.Context(), input)
	if errors.Is(err, application.ErrInvalidCandidate) {
		dependencies.Metrics.Observe("invalid")
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "service, environment, and errorType are required"})
		return
	}
	if errors.Is(err, application.ErrCandidateDelivery) {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "incident service unavailable"})
		return
	}
	if err != nil {
		dependencies.Metrics.Observe("failed")
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "candidate detection failed"})
		return
	}
	dependencies.Metrics.Observe("accepted")
	writeJSON(writer, http.StatusAccepted, detected)
}

func authenticate(next http.Handler, authenticator application.RequestAuthenticator) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/health" && request.URL.Path != "/ready" && request.URL.Path != "/metrics" && !authenticator.Authenticate(request.Header.Get("Authorization")) {
			writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "authentication is required"})
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
