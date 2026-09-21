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
	"github.com/sre-agent/incident-service/internal/api"
	"github.com/sre-agent/incident-service/internal/application"
	"github.com/sre-agent/incident-service/internal/postgres"
)

func main() {
	ctx := context.Background()
	databaseURL := envOrDefault("DATABASE_URL", "postgres://sre_agent:sre_agent_local@localhost:5432/sre_agent?sslmode=disable")
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		slog.Error("invalid database configuration", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	address := envOrDefault("HTTP_ADDRESS", ":4020")
	repository := postgres.NewIncidentRepositoryV1(pool)
	incidentService := application.NewIncidentServiceV1(repository)
	server := &http.Server{
		Addr:              address,
		Handler:           api.NewHandler(incidentService, repository, envOrDefault("SERVICE_VERSION", "local")),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdownContext.Done()
		gracefulContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if shutdownErr := server.Shutdown(gracefulContext); shutdownErr != nil {
			slog.Error("graceful shutdown failed", "error", shutdownErr)
		}
	}()

	slog.Info("incident service listening", "address", address)
	if err = server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("incident service stopped", "error", err)
		os.Exit(1)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
