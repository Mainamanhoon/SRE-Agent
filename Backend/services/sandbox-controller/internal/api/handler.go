package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/sre-agent/sandbox-controller/internal/application"
	"github.com/sre-agent/sandbox-controller/internal/domain"
)

func NewHandler(creator application.SandboxCreator, readiness application.ReadinessProbe, serviceVersion string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{
			"status": "ok", "service": "sandbox-controller", "version": serviceVersion,
		})
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
		defer cancel()
		if err := readiness.Ready(ctx); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("POST /api/v1/sandboxes", func(writer http.ResponseWriter, request *http.Request) {
		request.Body = http.MaxBytesReader(writer, request.Body, 1<<20)
		decoder := json.NewDecoder(request.Body)
		decoder.DisallowUnknownFields()
		var input domain.CreateSandboxInput
		if err := decoder.Decode(&input); err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid sandbox request"})
			return
		}
		sandbox, err := creator.Create(request.Context(), input)
		if errors.Is(err, application.ErrInvalidSandboxRequest) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid sandbox request"})
			return
		}
		if errors.Is(err, application.ErrUnsupportedToolchain) {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"error": "toolchain must be node or go"})
			return
		}
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "sandbox creation failed"})
			return
		}
		writeJSON(writer, http.StatusAccepted, sandbox)
	})
	return mux
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
