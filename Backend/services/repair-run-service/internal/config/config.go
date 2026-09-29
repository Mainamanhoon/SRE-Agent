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
	HTTPAddress, Environment, ServiceVersion, DatabaseURL, APIAuthToken string
	APIAuthEnabled                                                      bool
	BodyLimitBytes                                                      int64
	RequestTimeout, ShutdownTimeout, ReadinessTimeout                   time.Duration
	RequestsPerSecond, RequestBurst, DatabaseMaxConnections             int
}

func Load() (Config, error) {
	settings := Config{
		HTTPAddress: env("HTTP_ADDRESS", ":4070"), Environment: env("APP_ENV", "development"),
		ServiceVersion: env("SERVICE_VERSION", "local"),
		DatabaseURL:    env("DATABASE_URL", "postgres://sre_agent:sre_agent_local@localhost:5432/sre_agent?sslmode=disable"),
		APIAuthToken:   os.Getenv("API_AUTH_TOKEN"),
	}
	var err error
	if settings.APIAuthEnabled, err = parseBool("API_AUTH_ENABLED", false); err != nil {
		return Config{}, err
	}
	if settings.BodyLimitBytes, err = parseInt64("BODY_LIMIT_BYTES", 1<<20, 1024, 10<<20); err != nil {
		return Config{}, err
	}
	if settings.RequestsPerSecond, err = parseInt("REQUESTS_PER_SECOND", 2000, 1, 100000); err != nil {
		return Config{}, err
	}
	if settings.RequestBurst, err = parseInt("REQUEST_BURST", 4000, 1, 200000); err != nil {
		return Config{}, err
	}
	if settings.DatabaseMaxConnections, err = parseInt("DATABASE_MAX_CONNECTIONS", 50, 1, 500); err != nil {
		return Config{}, err
	}
	if settings.RequestTimeout, err = parseDuration("REQUEST_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if settings.ShutdownTimeout, err = parseDuration("SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if settings.ReadinessTimeout, err = parseDuration("READINESS_TIMEOUT", 2*time.Second); err != nil {
		return Config{}, err
	}
	if !strings.HasPrefix(settings.DatabaseURL, "postgres://") && !strings.HasPrefix(settings.DatabaseURL, "postgresql://") {
		return Config{}, errors.New("DATABASE_URL must be a PostgreSQL URL")
	}
	if settings.Environment == "production" && !settings.APIAuthEnabled {
		return Config{}, errors.New("API_AUTH_ENABLED must be true in production")
	}
	if settings.APIAuthEnabled && len(settings.APIAuthToken) < 32 {
		return Config{}, errors.New("API_AUTH_TOKEN must contain at least 32 characters")
	}
	return settings, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func parseBool(key string, fallback bool) (bool, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", key)
	}
	return parsed, nil
}
func parseInt(key string, fallback, min, max int) (int, error) {
	value, err := parseInt64(key, int64(fallback), int64(min), int64(max))
	return int(value), err
}
func parseInt64(key string, fallback, min, max int64) (int64, error) {
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
func parseDuration(key string, fallback time.Duration) (time.Duration, error) {
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
