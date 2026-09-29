package config

import (
	"testing"
)

func TestProductionRequiresAuthenticationAndToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("API_AUTH_ENABLED", "false")
	if _, err := Load(); err == nil {
		t.Fatal("expected production authentication requirement")
	}
	t.Setenv("API_AUTH_ENABLED", "true")
	t.Setenv("API_AUTH_TOKEN", "short")
	if _, err := Load(); err == nil {
		t.Fatal("expected minimum token length requirement")
	}
	t.Setenv("API_AUTH_TOKEN", "0123456789abcdef0123456789abcdef")
	if _, err := Load(); err != nil {
		t.Fatalf("expected valid secure configuration, got %v", err)
	}
}

func TestDatabaseURLMustUsePostgresScheme(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "http://not-a-database")
	if _, err := Load(); err == nil {
		t.Fatal("expected database URL validation")
	}
}
