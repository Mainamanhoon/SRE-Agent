package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/repair-run-service/internal/admission"
	"github.com/sre-agent/repair-run-service/internal/api"
	"github.com/sre-agent/repair-run-service/internal/application"
	"github.com/sre-agent/repair-run-service/internal/config"
	"github.com/sre-agent/repair-run-service/internal/infrastructure/clock"
	"github.com/sre-agent/repair-run-service/internal/metrics"
	"github.com/sre-agent/repair-run-service/internal/postgres"
	"github.com/sre-agent/repair-run-service/internal/security"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "healthcheck" {
		response, err := http.Get("http://127.0.0.1:4070/ready")
		if err != nil {
			os.Exit(1)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		return
	}
	settings, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	poolConfig, err := pgxpool.ParseConfig(settings.DatabaseURL)
	if err != nil {
		slog.Error("invalid database configuration", "error", err)
		os.Exit(1)
	}
	poolConfig.MaxConns = int32(settings.DatabaseMaxConnections)
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		slog.Error("database pool initialization failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	repository := postgres.NewRepairRunRepositoryV1(pool)
	service := application.NewRepairRunServiceV1(repository, clock.SystemClockV1{})
	server := &http.Server{
		Addr: settings.HTTPAddress,
		Handler: api.NewHandler(api.HandlerDependencies{
			UseCases: service, Readiness: repository,
			Authenticator: security.NewBearerAuthenticatorV1(settings.APIAuthEnabled, settings.APIAuthToken),
			Limiter:       admission.NewTokenBucketV1(settings.RequestsPerSecond, settings.RequestBurst),
			Metrics:       &metrics.RepairRunMetricsV1{}, ServiceVersion: settings.ServiceVersion,
			BodyLimitBytes: settings.BodyLimitBytes, ReadinessTimeout: settings.ReadinessTimeout,
		}),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: settings.RequestTimeout,
		WriteTimeout: settings.RequestTimeout, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), settings.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			slog.Error("graceful shutdown failed", "error", err)
		}
	}()
	slog.Info("repair run service listening", "address", settings.HTTPAddress)
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
