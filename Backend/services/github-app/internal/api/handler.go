package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/sre-agent/github-app/internal/application"
	"github.com/sre-agent/github-app/internal/domain"
)

type Dependencies struct {
	Deliveries      application.DeliveryCreator
	Archives        application.SourceArchiveReader
	Auth            application.RequestAuthenticator
	Limiter         application.RequestLimiter
	Webhooks        application.WebhookVerifier
	WebhookReceiver application.WebhookAcceptor
	Readiness       application.ReadinessProbe
	Metrics         application.Metrics
	Version         string
	BodyLimitBytes  int64
}

func NewHandler(dependencies Dependencies) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok", "service": "github-app", "version": dependencies.Version})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		if dependencies.Readiness == nil || dependencies.Readiness.Ping(request.Context()) != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /metrics", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = writer.Write([]byte(dependencies.Metrics.Prometheus()))
	})
	mux.HandleFunc("POST /api/v1/deliveries", func(writer http.ResponseWriter, request *http.Request) {
		var input domain.DeliveryRequest
		if !decodeJSON(writer, request, dependencies.BodyLimitBytes, &input) {
			dependencies.Metrics.Observe("rejected")
			return
		}
		delivery, err := dependencies.Deliveries.Create(request.Context(), input)
		if errors.Is(err, application.ErrInvalidRequest) {
			dependencies.Metrics.Observe("rejected")
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, application.ErrDeliveryConflict) {
			dependencies.Metrics.Observe("rejected")
			writeJSON(writer, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		if err != nil {
			dependencies.Metrics.Observe("failed")
			writeJSON(writer, http.StatusBadGateway, map[string]string{"error": "GitHub delivery failed"})
			return
		}
		dependencies.Metrics.Observe("delivered")
		writeJSON(writer, http.StatusCreated, delivery)
	})
	mux.HandleFunc("GET /api/v1/source-archives", func(writer http.ResponseWriter, request *http.Request) {
		installationID, err := strconv.ParseInt(request.URL.Query().Get("installationId"), 10, 64)
		if err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid archive request"})
			return
		}
		archive, err := dependencies.Archives.Archive(request.Context(), installationID, request.URL.Query().Get("repository"), request.URL.Query().Get("ref"))
		if errors.Is(err, application.ErrInvalidRequest) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, application.ErrRepositoryNotFound) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		if err != nil {
			dependencies.Metrics.Observe("failed")
			writeJSON(writer, http.StatusBadGateway, map[string]string{"error": "source archive unavailable"})
			return
		}
		defer archive.Body.Close()
		if archive.ContentLength > 0 {
			writer.Header().Set("Content-Length", strconv.FormatInt(archive.ContentLength, 10))
		}
		writer.Header().Set("Content-Type", "application/gzip")
		writer.WriteHeader(http.StatusOK)
		_, copyErr := io.Copy(writer, io.LimitReader(archive.Body, 200<<20))
		if copyErr == nil {
			dependencies.Metrics.Observe("archived")
		}
	})
	mux.HandleFunc("POST /api/v1/webhooks/github", func(writer http.ResponseWriter, request *http.Request) {
		request.Body = http.MaxBytesReader(writer, request.Body, dependencies.BodyLimitBytes)
		body, err := io.ReadAll(request.Body)
		if err != nil || !dependencies.Webhooks.Verify(body, request.Header.Get("X-Hub-Signature-256")) {
			dependencies.Metrics.Observe("rejected")
			writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "invalid webhook signature"})
			return
		}
		event := request.Header.Get("X-GitHub-Event")
		deliveryID := request.Header.Get("X-GitHub-Delivery")
		if event == "" || deliveryID == "" || dependencies.WebhookReceiver == nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "missing GitHub delivery metadata"})
			return
		}
		created, acceptErr := dependencies.WebhookReceiver.Accept(request.Context(), deliveryID, event, body)
		if errors.Is(acceptErr, application.ErrInvalidRequest) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid GitHub webhook payload"})
			return
		}
		if errors.Is(acceptErr, application.ErrWebhookConflict) {
			writeJSON(writer, http.StatusConflict, map[string]string{"error": "delivery id already used with different content"})
			return
		}
		if acceptErr != nil {
			dependencies.Metrics.Observe("failed")
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "webhook delivery could not be persisted"})
			return
		}
		dependencies.Metrics.Observe("webhook")
		writeJSON(writer, http.StatusAccepted, map[string]any{"status": "accepted", "event": event, "duplicate": !created})
	})
	return securityHeaders(authenticate(rateLimit(mux, dependencies.Limiter, dependencies.Metrics), dependencies.Auth))
}
func authenticate(next http.Handler, auth application.RequestAuthenticator) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !healthRoute(request.URL.Path) && request.URL.Path != "/api/v1/webhooks/github" && !auth.Authenticate(request.Header.Get("Authorization")) {
			writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "authentication is required"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func rateLimit(next http.Handler, limiter application.RequestLimiter, metrics application.Metrics) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !healthRoute(request.URL.Path) && !limiter.Allow() {
			metrics.Observe("rejected")
			writer.Header().Set("Retry-After", "1")
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"error": "request rate limit exceeded"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func healthRoute(path string) bool {
	return path == "/health" || path == "/ready" || path == "/metrics"
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
func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
