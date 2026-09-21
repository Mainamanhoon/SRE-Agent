package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/fingerprint"
)

type fixedClock struct{}

func (fixedClock) Now() time.Time { return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC) }

func TestCandidateFingerprintNormalizesVolatileNumbers(t *testing.T) {
	detector := application.NewDetectorV1(fingerprint.NewSHA256V1(), fixedClock{})
	handler := NewHandler(detector, "incident-detector", "test")

	first := postCandidate(t, handler, `{"service":"checkout","environment":"prod","errorType":"Timeout","errorMessage":"request 123 timed out after 5000 ms","topFrame":"pay.ts:42"}`)
	second := postCandidate(t, handler, `{"service":"checkout","environment":"prod","errorType":"Timeout","errorMessage":"request 456 timed out after 9000 ms","topFrame":"pay.ts:42"}`)

	if first != second {
		t.Fatalf("expected matching fingerprints, got %q and %q", first, second)
	}
}

func postCandidate(t *testing.T, handler http.Handler, body string) string {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/candidates", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, response.Code)
	}
	const marker = `"fingerprint":"`
	start := strings.Index(response.Body.String(), marker)
	if start < 0 {
		t.Fatalf("fingerprint missing from response: %s", response.Body.String())
	}
	start += len(marker)
	end := strings.Index(response.Body.String()[start:], `"`)
	return response.Body.String()[start : start+end]
}
