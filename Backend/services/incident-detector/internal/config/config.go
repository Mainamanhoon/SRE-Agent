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
	HTTPAddress        string
	Environment        string
	ServiceVersion     string
	IncidentServiceURL string
	APIAuthEnabled     bool
	APIAuthToken       string
	InternalToken      string
	BodyLimitBytes     int64
	RequestTimeout     time.Duration
	ShutdownTimeout    time.Duration
	DependencyTimeout  time.Duration
	DeliveryAttempts   int
	RequestsPerSecond  int
	RequestBurst       int
}

func Load() (Config, error) {
	config := Config{
		HTTPAddress: env("HTTP_ADDRESS", ":4010"), Environment: env("APP_ENV", "development"),
		ServiceVersion: env("SERVICE_VERSION", "local"), IncidentServiceURL: env("INCIDENT_SERVICE_URL", "http://localhost:4020"),
		APIAuthToken: os.Getenv("API_AUTH_TOKEN"), InternalToken: os.Getenv("INTERNAL_SERVICE_TOKEN"),
	}
	var err error
	if config.APIAuthEnabled, err = boolean("API_AUTH_ENABLED", false); err != nil {
		return Config{}, err
	}
	if config.BodyLimitBytes, err = integer64("BODY_LIMIT_BYTES", 1<<20, 1024, 10<<20); err != nil {
		return Config{}, err
	}
	if config.DeliveryAttempts, err = integer("DELIVERY_MAX_ATTEMPTS", 3, 1, 10); err != nil {
		return Config{}, err
	}
	if config.RequestsPerSecond, err = integer("REQUESTS_PER_SECOND", 2000, 1, 100000); err != nil {
		return Config{}, err
	}
	if config.RequestBurst, err = integer("REQUEST_BURST", 4000, 1, 200000); err != nil {
		return Config{}, err
	}
	if config.RequestTimeout, err = duration("REQUEST_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if config.ShutdownTimeout, err = duration("SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if config.DependencyTimeout, err = duration("DEPENDENCY_TIMEOUT", 2*time.Second); err != nil {
		return Config{}, err
	}
	if !strings.HasPrefix(config.IncidentServiceURL, "http://") && !strings.HasPrefix(config.IncidentServiceURL, "https://") {
		return Config{}, errors.New("INCIDENT_SERVICE_URL must be an HTTP(S) URL")
	}
	if config.Environment == "production" && !config.APIAuthEnabled {
		return Config{}, errors.New("API_AUTH_ENABLED must be true in production")
	}
	if config.APIAuthEnabled && len(config.APIAuthToken) < 32 {
		return Config{}, errors.New("API_AUTH_TOKEN must contain at least 32 characters")
	}
	if config.Environment == "production" && len(config.InternalToken) < 32 {
		return Config{}, errors.New("INTERNAL_SERVICE_TOKEN must contain at least 32 characters in production")
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
func integer(key string, fallback, minimum, maximum int) (int, error) {
	value, err := integer64(key, int64(fallback), int64(minimum), int64(maximum))
	return int(value), err
}
func integer64(key string, fallback, minimum, maximum int64) (int64, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be between %d and %d", key, minimum, maximum)
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
