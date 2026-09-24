package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sre-agent/github-app/internal/admission"
	"github.com/sre-agent/github-app/internal/api"
	"github.com/sre-agent/github-app/internal/application"
	"github.com/sre-agent/github-app/internal/config"
	githubadapter "github.com/sre-agent/github-app/internal/github"
	"github.com/sre-agent/github-app/internal/metrics"
	"github.com/sre-agent/github-app/internal/security"
)

func main() {
	settings, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	client := &http.Client{Timeout: settings.RequestTimeout}
	tokens, err := githubadapter.NewInstallationTokenProviderV1(settings.AppID, settings.PrivateKeyPEM, settings.APIBaseURL, client)
	if err != nil {
		slog.Error("cannot configure GitHub App authentication", "error", err)
		os.Exit(1)
	}
	gateway := githubadapter.NewRESTGatewayV1(settings.APIBaseURL, tokens, client)
	deliveries := application.NewDeliveryServiceV1(gateway)
	serviceMetrics := &metrics.MetricsV1{}
	server := &http.Server{Addr: settings.HTTPAddress, Handler: api.NewHandler(api.Dependencies{Deliveries: deliveries, Archives: deliveries, Auth: security.NewBearerAuthenticatorV1(settings.APIAuthEnabled, settings.APIAuthToken), Limiter: admission.NewTokenBucketV1(settings.RequestsPerSecond, settings.RequestBurst), Webhooks: security.NewWebhookVerifierV1(settings.WebhookSecret), Metrics: serviceMetrics, Version: settings.Version, BodyLimitBytes: settings.BodyLimitBytes}), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 35 * time.Second, WriteTimeout: 2 * time.Minute, IdleTimeout: 60 * time.Second}
	shutdown, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdown.Done()
		ctx, cancel := context.WithTimeout(context.Background(), settings.ShutdownTimeout)
		defer cancel()
		if shutdownErr := server.Shutdown(ctx); shutdownErr != nil {
			slog.Error("graceful shutdown failed", "error", shutdownErr)
		}
	}()
	slog.Info("GitHub App service listening", "address", settings.HTTPAddress)
	if err = server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("GitHub App service stopped", "error", err)
		os.Exit(1)
	}
}
