package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sre-agent/github-app/internal/metrics"
	"github.com/sre-agent/github-app/internal/security"
)

type acceptingWebhookReceiver struct {
	calls   int
	created bool
}

func (receiver *acceptingWebhookReceiver) Accept(context.Context, string, string, []byte) (bool, error) {
	receiver.calls++
	return receiver.created, nil
}

type allowAllLimiter struct{}

func (allowAllLimiter) Allow() bool { return true }

type rejectAllLimiter struct{}

func (rejectAllLimiter) Allow() bool { return false }

func TestWebhookRequiresValidSignatureBeforeDurableAcceptance(t *testing.T) {
	receiver := &acceptingWebhookReceiver{created: true}
	handler := NewHandler(Dependencies{
		Auth:    security.NewBearerAuthenticatorV1(true, "internal-service-token-long-enough-0001"),
		Limiter: allowAllLimiter{}, Webhooks: security.NewWebhookVerifierV1("webhook-secret-long-enough-0000001"),
		WebhookReceiver: receiver, Readiness: nil, Metrics: &metrics.MetricsV1{}, BodyLimitBytes: 1 << 20,
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/github", strings.NewReader(`{"action":"closed"}`))
	request.Header.Set("X-GitHub-Event", "pull_request")
	request.Header.Set("X-GitHub-Delivery", "delivery-1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || receiver.calls != 0 {
		t.Fatalf("invalid signature must not be persisted: status=%d calls=%d", response.Code, receiver.calls)
	}
}

func TestWebhookPersistsBeforeAcceptedResponseAndIsReplaySafe(t *testing.T) {
	body := `{"action":"closed"}`
	secret := "webhook-secret-long-enough-0000001"
	digest := hmac.New(sha256.New, []byte(secret))
	_, _ = digest.Write([]byte(body))
	signature := "sha256=" + hex.EncodeToString(digest.Sum(nil))
	receiver := &acceptingWebhookReceiver{created: false}
	handler := NewHandler(Dependencies{
		Auth:    security.NewBearerAuthenticatorV1(true, "internal-service-token-long-enough-0001"),
		Limiter: allowAllLimiter{}, Webhooks: security.NewWebhookVerifierV1(secret),
		WebhookReceiver: receiver, Metrics: &metrics.MetricsV1{}, BodyLimitBytes: 1 << 20,
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/github", strings.NewReader(body))
	request.Header.Set("X-Hub-Signature-256", signature)
	request.Header.Set("X-GitHub-Event", "issues")
	request.Header.Set("X-GitHub-Delivery", "delivery-1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusAccepted || receiver.calls != 1 || !strings.Contains(response.Body.String(), `"duplicate":true`) {
		t.Fatalf("delivery replay should acknowledge only after store acceptance: status=%d calls=%d body=%s", response.Code, receiver.calls, response.Body.String())
	}
}

func TestWebhookAdmissionLimiterAppliesBeforePayloadAcceptance(t *testing.T) {
	receiver := &acceptingWebhookReceiver{created: true}
	handler := NewHandler(Dependencies{
		Auth:    security.NewBearerAuthenticatorV1(true, "internal-service-token-long-enough-0001"),
		Limiter: rejectAllLimiter{}, Webhooks: security.NewWebhookVerifierV1("webhook-secret-long-enough-0000001"),
		WebhookReceiver: receiver, Metrics: &metrics.MetricsV1{}, BodyLimitBytes: 1 << 20,
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/github", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusTooManyRequests || receiver.calls != 0 {
		t.Fatalf("webhook endpoint must be rate limited: status=%d calls=%d", response.Code, receiver.calls)
	}
}
