package incidentclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/sre-agent/incident-detector/internal/application"
	"github.com/sre-agent/incident-detector/internal/domain"
)

const maxResponseBytes = 1 << 20

var (
	_ application.CandidateSink  = (*HTTPClientV1)(nil)
	_ application.ReadinessProbe = (*HTTPClientV1)(nil)
)

type HTTPClientV1 struct {
	baseURL      string
	serviceToken string
	client       *http.Client
	maxAttempts  int
}

func NewHTTPClientV1(baseURL, serviceToken string, timeout time.Duration, maxAttempts int) *HTTPClientV1 {
	return &HTTPClientV1{
		baseURL: strings.TrimRight(baseURL, "/"), serviceToken: serviceToken,
		client: &http.Client{Timeout: timeout}, maxAttempts: maxAttempts,
	}
}

func (client *HTTPClientV1) Record(ctx context.Context, candidate domain.Candidate, fingerprint string) (string, error) {
	payload, err := json.Marshal(map[string]string{
		"fingerprint": fingerprint, "service": candidate.Service, "environment": candidate.Environment,
		"severity": candidate.Severity, "traceId": candidate.TraceID, "errorSummary": candidate.ErrorMessage,
	})
	if err != nil {
		return "", fmt.Errorf("encode incident: %w", err)
	}
	var lastErr error
	for attempt := 1; attempt <= client.maxAttempts; attempt++ {
		incidentID, retry, requestErr := client.recordOnce(ctx, payload)
		if requestErr == nil {
			return incidentID, nil
		}
		lastErr = requestErr
		if !retry || attempt == client.maxAttempts {
			break
		}
		select {
		case <-ctx.Done():
			return "", context.Cause(ctx)
		case <-time.After(time.Duration(25*(1<<(attempt-1))) * time.Millisecond):
		}
	}
	return "", lastErr
}

func (client *HTTPClientV1) recordOnce(ctx context.Context, payload []byte) (string, bool, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.baseURL+"/api/v1/incidents", bytes.NewReader(payload))
	if err != nil {
		return "", false, err
	}
	request.Header.Set("Content-Type", "application/json")
	if client.serviceToken != "" {
		request.Header.Set("Authorization", "Bearer "+client.serviceToken)
	}
	response, err := client.client.Do(request)
	if err != nil {
		return "", true, fmt.Errorf("record incident: %w", err)
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if readErr != nil {
		return "", true, fmt.Errorf("read incident response: %w", readErr)
	}
	if len(body) > maxResponseBytes {
		return "", false, errors.New("incident response exceeded size limit")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", response.StatusCode >= 500 || response.StatusCode == http.StatusTooManyRequests,
			fmt.Errorf("incident service returned status %d", response.StatusCode)
	}
	var output struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &output); err != nil || output.ID == "" {
		return "", false, errors.New("incident response did not contain an id")
	}
	return output.ID, false, nil
}

func (client *HTTPClientV1) Check(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.baseURL+"/ready", nil)
	if err != nil {
		return err
	}
	if client.serviceToken != "" {
		request.Header.Set("Authorization", "Bearer "+client.serviceToken)
	}
	response, err := client.client.Do(request)
	if err != nil {
		return fmt.Errorf("incident service readiness: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("incident service readiness returned status %d", response.StatusCode)
	}
	return nil
}
