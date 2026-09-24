package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strings"

	"github.com/sre-agent/github-app/internal/application"
)

var _ application.RequestAuthenticator = (*BearerAuthenticatorV1)(nil)
var _ application.WebhookVerifier = (*WebhookVerifierV1)(nil)

type BearerAuthenticatorV1 struct {
	enabled bool
	digest  [sha256.Size]byte
}

func NewBearerAuthenticatorV1(enabled bool, token string) *BearerAuthenticatorV1 {
	return &BearerAuthenticatorV1{enabled: enabled, digest: sha256.Sum256([]byte(token))}
}
func (auth *BearerAuthenticatorV1) Authenticate(header string) bool {
	if !auth.enabled {
		return true
	}
	if !strings.HasPrefix(header, "Bearer ") {
		return false
	}
	presented := sha256.Sum256([]byte(strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))))
	return subtle.ConstantTimeCompare(auth.digest[:], presented[:]) == 1
}

type WebhookVerifierV1 struct{ secret []byte }

func NewWebhookVerifierV1(secret string) *WebhookVerifierV1 {
	return &WebhookVerifierV1{secret: []byte(secret)}
}
func (verifier *WebhookVerifierV1) Verify(body []byte, signature string) bool {
	if !strings.HasPrefix(signature, "sha256=") {
		return false
	}
	presented, err := hex.DecodeString(strings.TrimPrefix(signature, "sha256="))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, verifier.secret)
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	return hmac.Equal(expected, presented)
}
