package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddress, Environment, Version, APIBaseURL, PrivateKeyPEM, WebhookSecret, APIAuthToken string
	AppID                                                                                     int64
	APIAuthEnabled                                                                            bool
	BodyLimitBytes                                                                            int64
	RequestsPerSecond, RequestBurst                                                           int
	RequestTimeout, ShutdownTimeout                                                           time.Duration
}

func Load() (Config, error) {
	config := Config{HTTPAddress: env("HTTP_ADDRESS", ":4050"), Environment: env("APP_ENV", "development"), Version: env("SERVICE_VERSION", "local"), APIBaseURL: env("GITHUB_API_URL", "https://api.github.com"), WebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"), APIAuthToken: os.Getenv("API_AUTH_TOKEN")}
	var err error
	if config.AppID, err = integer64("GITHUB_APP_ID", 0, 1, 1<<62); err != nil {
		return Config{}, err
	}
	key := strings.ReplaceAll(os.Getenv("GITHUB_APP_PRIVATE_KEY_PEM"), `\n`, "\n")
	if encoded := os.Getenv("GITHUB_APP_PRIVATE_KEY_BASE64"); key == "" && encoded != "" {
		decoded, decodeErr := base64.StdEncoding.DecodeString(encoded)
		if decodeErr != nil {
			return Config{}, errors.New("GITHUB_APP_PRIVATE_KEY_BASE64 is invalid")
		}
		key = string(decoded)
	}
	config.PrivateKeyPEM = key
	if config.APIAuthEnabled, err = boolean("API_AUTH_ENABLED", true); err != nil {
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
	if config.RequestTimeout, err = duration("REQUEST_TIMEOUT", 30*time.Second); err != nil {
		return Config{}, err
	}
	if config.ShutdownTimeout, err = duration("SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if config.AppID <= 0 || config.PrivateKeyPEM == "" || len(config.WebhookSecret) < 32 {
		return Config{}, errors.New("GitHub App id, private key, and a 32-character webhook secret are required")
	}
	if config.APIAuthEnabled && len(config.APIAuthToken) < 32 {
		return Config{}, errors.New("API_AUTH_TOKEN must contain at least 32 characters")
	}
	if config.Environment == "production" && !config.APIAuthEnabled {
		return Config{}, errors.New("API_AUTH_ENABLED must be true in production")
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
