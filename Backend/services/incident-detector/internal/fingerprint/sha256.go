package fingerprint

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"

	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/domain"
)

var (
	uuidPattern   = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`)
	numberPattern = regexp.MustCompile(`\b\d+\b`)
)

var _ application.FingerprintGenerator = SHA256V1{}

type SHA256V1 struct{}

func NewSHA256V1() SHA256V1 { return SHA256V1{} }

func (SHA256V1) Fingerprint(input domain.Candidate) string {
	parts := []string{
		strings.ToLower(strings.TrimSpace(input.Service)),
		strings.ToLower(strings.TrimSpace(input.Environment)),
		strings.ToLower(strings.TrimSpace(input.ErrorType)),
		normalizeMessage(input.ErrorMessage),
		strings.TrimSpace(input.TopFrame),
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:])
}

func normalizeMessage(message string) string {
	normalized := strings.ToLower(strings.Join(strings.Fields(message), " "))
	normalized = uuidPattern.ReplaceAllString(normalized, "<uuid>")
	return numberPattern.ReplaceAllString(normalized, "<number>")
}
