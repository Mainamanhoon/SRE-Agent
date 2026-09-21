package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sre-agent/incident-detector/internal/api"
	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/clock"
	"github.com/sre-agent/incident-detector/internal/fingerprint"
)

func main() {
	address := envOrDefault("HTTP_ADDRESS", ":4010")
	serviceVersion := envOrDefault("SERVICE_VERSION", "local")
	detector := application.NewDetectorV1(fingerprint.NewSHA256V1(), clock.NewSystemClock())
	server := &http.Server{
		Addr:              address,
		Handler:           api.NewHandler(detector, "incident-detector", serviceVersion),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-shutdownContext.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			slog.Error("graceful shutdown failed", "error", err)
		}
	}()

	slog.Info("incident detector listening", "address", address)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("incident detector stopped", "error", err)
		os.Exit(1)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
