package security

import (
	"crypto/sha256"
	"crypto/subtle"
	"strings"

	"github.com/sre-agent/incident-detector/internal/application"
)

var _ application.RequestAuthenticator = (*BearerAuthenticatorV1)(nil)

// BearerAuthenticatorV1 implements RequestAuthenticator with constant-time
// digest comparison so future authentication implementations remain pluggable.
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
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	presented := sha256.Sum256([]byte(strings.TrimSpace(strings.TrimPrefix(header, prefix))))
	return subtle.ConstantTimeCompare(auth.digest[:], presented[:]) == 1
}
