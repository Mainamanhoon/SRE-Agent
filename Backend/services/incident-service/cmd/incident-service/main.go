package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/incident-service/internal/admission"
	"github.com/sre-agent/incident-service/internal/api"
	"github.com/sre-agent/incident-service/internal/application"
	"github.com/sre-agent/incident-service/internal/config"
	"github.com/sre-agent/incident-service/internal/metrics"
	"github.com/sre-agent/incident-service/internal/postgres"
	"github.com/sre-agent/incident-service/internal/security"
)

func main() {
	settings, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	ctx := context.Background()
	poolConfig, err := pgxpool.ParseConfig(settings.DatabaseURL)
	if err != nil {
		slog.Error("invalid database configuration", "error", err)
		os.Exit(1)
	}
	poolConfig.MaxConns = int32(settings.DatabaseMaxConnections)
	poolConfig.MinConns = int32(settings.DatabaseMinConnections)
	poolConfig.MaxConnLifetime = settings.DatabaseMaxConnectionLifetime
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		slog.Error("invalid database configuration", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	repository := postgres.NewIncidentRepositoryV1(pool)
	incidentService := application.NewIncidentServiceV1(repository, application.IncidentStatusPolicyV1{})
	server := &http.Server{
		Addr: settings.HTTPAddress,
		Handler: api.NewHandler(api.HandlerDependencies{
			Recorder: incidentService, Reader: incidentService, Statuses: incidentService, Readiness: repository,
			Authenticator: security.NewBearerAuthenticatorV1(settings.APIAuthEnabled, settings.APIAuthToken),
			Limiter:       admission.NewTokenBucketV1(settings.RequestsPerSecond, settings.RequestBurst), Metrics: &metrics.IncidentMetricsV1{},
			ServiceVersion: settings.ServiceVersion, BodyLimitBytes: settings.BodyLimitBytes, ReadinessTimeout: settings.ReadinessTimeout,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       settings.RequestTimeout,
		WriteTimeout:      settings.RequestTimeout,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	shutdownContext, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdownContext.Done()
		gracefulContext, cancel := context.WithTimeout(context.Background(), settings.ShutdownTimeout)
		defer cancel()
		if shutdownErr := server.Shutdown(gracefulContext); shutdownErr != nil {
			slog.Error("graceful shutdown failed", "error", shutdownErr)
		}
	}()

	slog.Info("incident service listening", "address", settings.HTTPAddress)
	if err = server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("incident service stopped", "error", err)
		os.Exit(1)
	}
}
