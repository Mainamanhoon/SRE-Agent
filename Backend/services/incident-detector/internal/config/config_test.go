package config

import "testing"

func TestProductionRequiresAuthentication(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("API_AUTH_ENABLED", "false")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid production configuration")
	}
}

func TestAuthenticatedConfigurationRequiresStrongToken(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("API_AUTH_ENABLED", "true")
	t.Setenv("API_AUTH_TOKEN", "short")
	if _, err := Load(); err == nil {
		t.Fatal("expected short token rejection")
	}
}
