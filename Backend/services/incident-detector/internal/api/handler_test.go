package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/domain"
	"github.com/sre-agent/incident-detector/internal/fingerprint"
	"github.com/sre-agent/incident-detector/internal/metrics"
)

type fixedClock struct{}

func (fixedClock) Now() time.Time { return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC) }

type fakeSink struct{ err error }

func (sink fakeSink) Record(_ context.Context, _ domain.Candidate, _ string) (string, error) {
	return "incident-1", sink.err
}

type fakeReadiness struct{ err error }

func (probe fakeReadiness) Check(context.Context) error { return probe.err }

type fakeAuthenticator struct{ allowed bool }

func (auth fakeAuthenticator) Authenticate(string) bool { return auth.allowed }

type fakeLimiter struct{ allowed bool }

func (limiter fakeLimiter) Allow() bool { return limiter.allowed }

func TestCandidateFingerprintNormalizesVolatileNumbers(t *testing.T) {
	handler := testHandler(fakeSink{}, true, true)
	first := postCandidate(t, handler, `{"service":"checkout","environment":"prod","errorType":"Timeout","errorMessage":"request 123 timed out after 5000 ms","topFrame":"pay.ts:42"}`)
	second := postCandidate(t, handler, `{"service":"checkout","environment":"prod","errorType":"Timeout","errorMessage":"request 456 timed out after 9000 ms","topFrame":"pay.ts:42"}`)
	if first != second {
		t.Fatalf("expected matching fingerprints, got %q and %q", first, second)
	}
}

func TestRejectsUnauthenticatedCandidate(t *testing.T) {
	response := httptest.NewRecorder()
	testHandler(fakeSink{}, false, true).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/candidates", strings.NewReader(`{}`)))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, response.Code)
	}
}

func TestRejectsRateLimitedCandidate(t *testing.T) {
	response := httptest.NewRecorder()
	testHandler(fakeSink{}, true, false).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/candidates", strings.NewReader(`{}`)))
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected %d, got %d", http.StatusTooManyRequests, response.Code)
	}
	if response.Header().Get("Retry-After") != "1" {
		t.Fatal("expected Retry-After header")
	}
}

func TestReportsDeliveryFailureAsUnavailable(t *testing.T) {
	response := httptest.NewRecorder()
	body := `{"service":"checkout","environment":"prod","errorType":"Timeout","errorMessage":"timeout"}`
	testHandler(fakeSink{err: errors.New("offline")}, true, true).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/candidates", strings.NewReader(body)))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected %d, got %d", http.StatusServiceUnavailable, response.Code)
	}
}

func TestRejectsCandidateWithoutEnvironmentBeforeDelivery(t *testing.T) {
	response := httptest.NewRecorder()
	body := `{"service":"checkout","errorType":"Timeout","errorMessage":"timeout"}`
	testHandler(fakeSink{err: errors.New("must not deliver")}, true, true).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/candidates", strings.NewReader(body)))
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected %d, got %d", http.StatusUnprocessableEntity, response.Code)
	}
}

func testHandler(sink application.CandidateSink, authenticated, admitted bool) http.Handler {
	detector := application.NewDetectorV1(fingerprint.NewSHA256V1(), fixedClock{}, sink)
	return NewHandler(HandlerDependencies{
		Detector: detector, Readiness: fakeReadiness{}, Authenticator: fakeAuthenticator{authenticated},
		Limiter: fakeLimiter{admitted}, Metrics: &metrics.CandidateMetricsV1{}, ServiceName: "incident-detector",
		ServiceVersion: "test", BodyLimitBytes: 1 << 20, ReadinessTimeout: time.Second,
	})
}

func postCandidate(t *testing.T, handler http.Handler, body string) string {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/candidates", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d: %s", http.StatusAccepted, response.Code, response.Body.String())
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
