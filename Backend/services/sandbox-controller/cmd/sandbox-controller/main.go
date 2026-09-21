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

	"github.com/sre-agent/sandbox-controller/internal/api"
	"github.com/sre-agent/sandbox-controller/internal/application"
	sandboxkubernetes "github.com/sre-agent/sandbox-controller/internal/kubernetes"
	"github.com/sre-agent/sandbox-controller/internal/policy"
)

func main() {
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
		envOrDefault("SANDBOX_NAMESPACE", "sre-agent-sandboxes"),
		envOrDefault("SANDBOX_RUNTIME_CLASS", "gvisor"),
	)
	images := policy.NewToolchainImageResolverV1(map[string]string{
		"node": envOrDefault("SANDBOX_NODE_IMAGE", "node:22-bookworm-slim"),
		"go":   envOrDefault("SANDBOX_GO_IMAGE", "golang:1.24-bookworm"),
	})
	sandboxService := application.NewSandboxServiceV1(provisioner, images)
	address := envOrDefault("HTTP_ADDRESS", ":4030")
	server := &http.Server{
		Addr:              address,
		Handler:           api.NewHandler(sandboxService, provisioner, envOrDefault("SERVICE_VERSION", "local")),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdownContext.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if shutdownErr := server.Shutdown(ctx); shutdownErr != nil {
			slog.Error("graceful shutdown failed", "error", shutdownErr)
		}
	}()

	slog.Info("sandbox controller listening", "address", address)
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

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
