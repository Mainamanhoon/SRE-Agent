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
	HTTPAddress, Environment, ServiceVersion, DatabaseURL, APIAuthToken             string
	APIAuthEnabled                                                                  bool
	BodyLimitBytes                                                                  int64
	RequestTimeout, ShutdownTimeout, ReadinessTimeout                               time.Duration
	RequestsPerSecond, RequestBurst, DatabaseMaxConnections, DatabaseMinConnections int
	DatabaseMaxConnectionLifetime                                                   time.Duration
}

func Load() (Config, error) {
	config := Config{HTTPAddress: env("HTTP_ADDRESS", ":4020"), Environment: env("APP_ENV", "development"), ServiceVersion: env("SERVICE_VERSION", "local"), DatabaseURL: env("DATABASE_URL", "postgres://sre_agent:sre_agent_local@localhost:5432/sre_agent?sslmode=disable"), APIAuthToken: os.Getenv("API_AUTH_TOKEN")}
	var err error
	if config.APIAuthEnabled, err = boolean("API_AUTH_ENABLED", false); err != nil {
		return Config{}, err
	}
	if config.BodyLimitBytes, err = integer64("BODY_LIMIT_BYTES", 1<<20, 1024, 10<<20); err != nil {
		return Config{}, err
	}
	if config.RequestsPerSecond, err = integer("REQUESTS_PER_SECOND", 2000, 1, 100000); err != nil {
		return Config{}, err
	}
	if config.RequestBurst, err = integer("REQUEST_BURST", 4000, 1, 200000); err != nil {
		return Config{}, err
	}
	if config.DatabaseMaxConnections, err = integer("DATABASE_MAX_CONNECTIONS", 50, 1, 500); err != nil {
		return Config{}, err
	}
	if config.DatabaseMinConnections, err = integer("DATABASE_MIN_CONNECTIONS", 5, 0, config.DatabaseMaxConnections); err != nil {
		return Config{}, err
	}
	if config.RequestTimeout, err = duration("REQUEST_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if config.ShutdownTimeout, err = duration("SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if config.ReadinessTimeout, err = duration("READINESS_TIMEOUT", 2*time.Second); err != nil {
		return Config{}, err
	}
	if config.DatabaseMaxConnectionLifetime, err = duration("DATABASE_MAX_CONNECTION_LIFETIME", 30*time.Minute); err != nil {
		return Config{}, err
	}
	if !strings.HasPrefix(config.DatabaseURL, "postgres://") && !strings.HasPrefix(config.DatabaseURL, "postgresql://") {
		return Config{}, errors.New("DATABASE_URL must be a PostgreSQL URL")
	}
	if config.Environment == "production" && !config.APIAuthEnabled {
		return Config{}, errors.New("API_AUTH_ENABLED must be true in production")
	}
	if config.APIAuthEnabled && len(config.APIAuthToken) < 32 {
		return Config{}, errors.New("API_AUTH_TOKEN must contain at least 32 characters")
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
