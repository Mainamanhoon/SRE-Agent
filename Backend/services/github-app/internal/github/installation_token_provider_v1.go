package github

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/sre-agent/github-app/internal/application"
)

var _ application.InstallationTokenProvider = (*InstallationTokenProviderV1)(nil)

type cachedToken struct {
	value     string
	expiresAt time.Time
}
type InstallationTokenProviderV1 struct {
	appID      int64
	privateKey *rsa.PrivateKey
	baseURL    string
	client     *http.Client
	mu         sync.Mutex
	cache      map[int64]cachedToken
	locks      map[int64]*sync.Mutex
}

func NewInstallationTokenProviderV1(appID int64, privateKeyPEM, baseURL string, client *http.Client) (*InstallationTokenProviderV1, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, errors.New("GITHUB_APP_PRIVATE_KEY_PEM is invalid")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		if key, parseErr := x509.ParsePKCS1PrivateKey(block.Bytes); parseErr == nil {
			parsed = key
		} else {
			return nil, errors.New("GitHub App private key is invalid")
		}
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("GitHub App private key must be RSA")
	}
	return &InstallationTokenProviderV1{appID: appID, privateKey: key, baseURL: baseURL, client: client, cache: map[int64]cachedToken{}, locks: map[int64]*sync.Mutex{}}, nil
}

func (provider *InstallationTokenProviderV1) Token(ctx context.Context, installationID int64) (string, error) {
	installationLock := provider.installationLock(installationID)
	installationLock.Lock()
	defer installationLock.Unlock()
	provider.mu.Lock()
	cached, ok := provider.cache[installationID]
	provider.mu.Unlock()
	if ok && time.Until(cached.expiresAt) > 2*time.Minute {
		return cached.value, nil
	}
	jwt, err := provider.signJWT(time.Now())
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf("%s/app/installations/%d/access_tokens", provider.baseURL, installationID)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte("{}")))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+jwt)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := provider.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if response.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("GitHub installation token returned %d", response.StatusCode)
	}
	var result struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	if err = json.Unmarshal(payload, &result); err != nil || result.Token == "" {
		return "", errors.New("GitHub installation token response is invalid")
	}
	provider.mu.Lock()
	provider.cache[installationID] = cachedToken{value: result.Token, expiresAt: result.ExpiresAt}
	provider.mu.Unlock()
	return result.Token, nil
}

func (provider *InstallationTokenProviderV1) installationLock(installationID int64) *sync.Mutex {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	lock := provider.locks[installationID]
	if lock == nil {
		lock = &sync.Mutex{}
		provider.locks[installationID] = lock
	}
	return lock
}

func (provider *InstallationTokenProviderV1) signJWT(now time.Time) (string, error) {
	header, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT"})
	claims, _ := json.Marshal(map[string]any{"iat": now.Add(-30 * time.Second).Unix(), "exp": now.Add(9 * time.Minute).Unix(), "iss": strconv.FormatInt(provider.appID, 10)})
	unsigned := rawURL(header) + "." + rawURL(claims)
	digest := crypto.SHA256.New()
	_, _ = digest.Write([]byte(unsigned))
	signature, err := rsa.SignPKCS1v15(rand.Reader, provider.privateKey, crypto.SHA256, digest.Sum(nil))
	if err != nil {
		return "", err
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}
func rawURL(value []byte) string { return base64.RawURLEncoding.EncodeToString(value) }
