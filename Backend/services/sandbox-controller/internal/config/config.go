package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddress, Environment, ServiceVersion, Namespace, RuntimeClass, NodeImage, GoImage, APIAuthToken, SourceAuthToken string
	APIAuthEnabled                                                                                                       bool
	BodyLimitBytes                                                                                                       int64
	RequestsPerSecond, RequestBurst                                                                                      int
	ReadinessTimeout, ShutdownTimeout                                                                                    time.Duration
}

func Load() (Config, error) {
	config := Config{HTTPAddress: env("HTTP_ADDRESS", ":4030"), Environment: env("APP_ENV", "development"), ServiceVersion: env("SERVICE_VERSION", "local"), Namespace: env("SANDBOX_NAMESPACE", "sre-agent-sandboxes"), RuntimeClass: env("SANDBOX_RUNTIME_CLASS", "gvisor"), NodeImage: env("SANDBOX_NODE_IMAGE", "sre-agent/sandbox-node:local"), GoImage: env("SANDBOX_GO_IMAGE", "sre-agent/sandbox-go:local"), APIAuthToken: os.Getenv("API_AUTH_TOKEN"), SourceAuthToken: os.Getenv("SOURCE_AUTH_TOKEN")}
	var err error
	if config.APIAuthEnabled, err = boolean("API_AUTH_ENABLED", false); err != nil {
		return Config{}, err
	}
	if config.BodyLimitBytes, err = integer64("BODY_LIMIT_BYTES", 1<<20, 1024, 2<<20); err != nil {
		return Config{}, err
	}
	if config.RequestsPerSecond, err = integer("REQUESTS_PER_SECOND", 1000, 1, 100000); err != nil {
		return Config{}, err
	}
	if config.RequestBurst, err = integer("REQUEST_BURST", 2000, 1, 200000); err != nil {
		return Config{}, err
	}
	if config.ReadinessTimeout, err = duration("READINESS_TIMEOUT", 2*time.Second); err != nil {
		return Config{}, err
	}
	if config.ShutdownTimeout, err = duration("SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if config.Environment == "production" && (!config.APIAuthEnabled || len(config.SourceAuthToken) < 32) {
		return Config{}, errors.New("production requires API auth and a source auth token")
	}
	if config.APIAuthEnabled && len(config.APIAuthToken) < 32 {
		return Config{}, errors.New("API_AUTH_TOKEN must contain at least 32 characters")
	}
	if strings.TrimSpace(config.NodeImage) == "" || strings.TrimSpace(config.GoImage) == "" {
		return Config{}, errors.New("sandbox images are required")
	}
	return config, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func boolean(key string, fallback bool) (bool, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", key)
	}
	return value, nil
}
func integer(key string, fallback, min, max int) (int, error) {
	value, err := integer64(key, int64(fallback), int64(min), int64(max))
	return int(value), err
}
func integer64(key string, fallback, min, max int64) (int64, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < min || value > max {
		return 0, fmt.Errorf("%s must be between %d and %d", key, min, max)
	}
	return value, nil
}
func duration(key string, fallback time.Duration) (time.Duration, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration", key)
	}
	return value, nil
}
