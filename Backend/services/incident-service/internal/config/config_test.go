package config

import "testing"

func TestProductionRequiresAuthentication(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("API_AUTH_ENABLED", "false")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid production configuration")
	}
}
