package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestWebhookVerifier(t *testing.T) {
	body := []byte(`{"zen":"safe"}`)
	secret := "01234567890123456789012345678901"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if !NewWebhookVerifierV1(secret).Verify(body, signature) {
		t.Fatal("expected valid signature")
	}
	if NewWebhookVerifierV1(secret).Verify([]byte("tampered"), signature) {
		t.Fatal("expected invalid signature")
	}
}
