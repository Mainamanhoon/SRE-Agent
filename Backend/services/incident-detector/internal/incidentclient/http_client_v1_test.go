package incidentclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sre-agent/incident-detector/internal/domain"
)

func TestRecordRetriesServerFailureAndReturnsIncidentID(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		attempts++
		if request.Header.Get("Authorization") != "Bearer internal-token" {
			t.Error("missing service token")
		}
		if attempts == 1 {
			http.Error(writer, "temporary", http.StatusServiceUnavailable)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"id":"incident-123"}`))
	}))
	defer server.Close()
	client := NewHTTPClientV1(server.URL, "internal-token", time.Second, 2)
	id, err := client.Record(context.Background(), domain.Candidate{Service: "checkout", Environment: "prod", Severity: "error"}, "fingerprint")
	if err != nil {
		t.Fatal(err)
	}
	if id != "incident-123" {
		t.Fatalf("unexpected incident id %q", id)
	}
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
}
