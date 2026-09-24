package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/sre-agent/sandbox-controller/internal/admission"
	"github.com/sre-agent/sandbox-controller/internal/api"
	"github.com/sre-agent/sandbox-controller/internal/application"
	"github.com/sre-agent/sandbox-controller/internal/config"
	sandboxkubernetes "github.com/sre-agent/sandbox-controller/internal/kubernetes"
	"github.com/sre-agent/sandbox-controller/internal/metrics"
	"github.com/sre-agent/sandbox-controller/internal/policy"
	"github.com/sre-agent/sandbox-controller/internal/security"
)

func main() {
	settings, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	clusterConfig, err := kubernetesConfig()
	if err != nil {
		slog.Error("cannot configure Kubernetes client", "error", err)
		os.Exit(1)
	}
	client, err := kubernetes.NewForConfig(clusterConfig)
	if err != nil {
		slog.Error("cannot create Kubernetes client", "error", err)
		os.Exit(1)
	}

	provisioner := sandboxkubernetes.NewJobProvisionerV1(
		client,
		settings.Namespace,
		settings.RuntimeClass,
		settings.SourceAuthToken,
	)
	images := policy.NewToolchainImageResolverV1(map[string]string{
		"node": settings.NodeImage,
		"go":   settings.GoImage,
	})
	sandboxService := application.NewSandboxServiceV1(provisioner, images)
	serviceMetrics := &metrics.SandboxMetricsV1{}
	server := &http.Server{
		Addr: settings.HTTPAddress,
		Handler: api.NewHandler(api.HandlerDependencies{
			Creator: sandboxService, Reader: sandboxService, Deleter: sandboxService,
			Readiness:     provisioner,
			Authenticator: security.NewBearerAuthenticatorV1(settings.APIAuthEnabled, settings.APIAuthToken),
			Limiter:       admission.NewTokenBucketV1(settings.RequestsPerSecond, settings.RequestBurst),
			Metrics:       serviceMetrics, ServiceVersion: settings.ServiceVersion,
			BodyLimitBytes: settings.BodyLimitBytes, ReadinessTimeout: settings.ReadinessTimeout,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdownContext.Done()
		ctx, cancel := context.WithTimeout(context.Background(), settings.ShutdownTimeout)
		defer cancel()
		if shutdownErr := server.Shutdown(ctx); shutdownErr != nil {
			slog.Error("graceful shutdown failed", "error", shutdownErr)
		}
	}()

	slog.Info("sandbox controller listening", "address", settings.HTTPAddress)
	if err = server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("sandbox controller stopped", "error", err)
		os.Exit(1)
	}
}

func kubernetesConfig() (*rest.Config, error) {
	if config, err := rest.InClusterConfig(); err == nil {
		return config, nil
	}
	kubeconfig := os.Getenv("KUBECONFIG")
	if kubeconfig == "" {
		if userHome, err := os.UserHomeDir(); err == nil {
			kubeconfig = filepath.Join(userHome, ".kube", "config")
		}
	}
	return clientcmd.BuildConfigFromFlags("", kubeconfig)
}
