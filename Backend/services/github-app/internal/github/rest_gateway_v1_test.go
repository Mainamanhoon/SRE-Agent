package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

type staticInstallationToken string

func (token staticInstallationToken) Token(context.Context, int64) (string, error) {
	return string(token), nil
}

func TestRepairRunIDFromCommitRequiresUniqueTrustedTrailer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/repos/example/service/git/commits/abcdef1234567" || request.Header.Get("Authorization") != "Bearer installation-token" {
			t.Errorf("unexpected GitHub request: %s %s", request.Method, request.URL.String())
		}
		_, _ = writer.Write([]byte(`{"message":"Repair service guard\n\nSRE-Agent-Repair-Run: Run-1"}`))
	}))
	defer server.Close()
	gateway := NewRESTGatewayV1(server.URL, staticInstallationToken("installation-token"), server.Client())
	runID, err := gateway.RepairRunIDFromCommit(context.Background(), 42, "example/service", "abcdef1234567")
	if err != nil || runID != "Run-1" {
		t.Fatalf("expected exact repair trailer, got %q, %v", runID, err)
	}
}

func TestRepairRunIDFromCommitRejectsAmbiguousTrailers(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(`{"message":"SRE-Agent-Repair-Run: run-1\nSRE-Agent-Repair-Run: run-2"}`))
	}))
	defer server.Close()
	gateway := NewRESTGatewayV1(server.URL, staticInstallationToken("installation-token"), server.Client())
	runID, err := gateway.RepairRunIDFromCommit(context.Background(), 42, "example/service", "abcdef1234567")
	if err != nil || runID != "" {
		t.Fatalf("ambiguous trailer must not link a run: %q, %v", runID, err)
	}
}
