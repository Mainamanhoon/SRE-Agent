package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sre-agent/incident-detector/internal/admission"
	"github.com/sre-agent/incident-detector/internal/api"
	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/clock"
	"github.com/sre-agent/incident-detector/internal/config"
	"github.com/sre-agent/incident-detector/internal/fingerprint"
	"github.com/sre-agent/incident-detector/internal/incidentclient"
	"github.com/sre-agent/incident-detector/internal/metrics"
	"github.com/sre-agent/incident-detector/internal/security"
)

func main() {
	settings, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	incidentClient := incidentclient.NewHTTPClientV1(
		settings.IncidentServiceURL,
		settings.InternalToken,
		settings.DependencyTimeout,
		settings.DeliveryAttempts,
	)
	detector := application.NewDetectorV1(fingerprint.NewSHA256V1(), clock.NewSystemClock(), incidentClient)
	server := &http.Server{
		Addr: settings.HTTPAddress,
		Handler: api.NewHandler(api.HandlerDependencies{
			Detector:         detector,
			Readiness:        incidentClient,
			Authenticator:    security.NewBearerAuthenticatorV1(settings.APIAuthEnabled, settings.APIAuthToken),
			Limiter:          admission.NewTokenBucketV1(settings.RequestsPerSecond, settings.RequestBurst),
			Metrics:          &metrics.CandidateMetricsV1{},
			ServiceName:      "incident-detector",
			ServiceVersion:   settings.ServiceVersion,
			BodyLimitBytes:   settings.BodyLimitBytes,
			ReadinessTimeout: settings.DependencyTimeout,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       settings.RequestTimeout,
		WriteTimeout:      settings.RequestTimeout,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-shutdownContext.Done()
		ctx, cancel := context.WithTimeout(context.Background(), settings.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			slog.Error("graceful shutdown failed", "error", err)
		}
	}()

	slog.Info("incident detector listening", "address", settings.HTTPAddress)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("incident detector stopped", "error", err)
		os.Exit(1)
	}
}
