package admission

import (
	"sync"
	"time"

	"github.com/sre-agent/incident-detector/internal/application"
)

var _ application.RequestLimiter = (*TokenBucketV1)(nil)

// TokenBucketV1 is a per-replica limiter. A gateway or distributed limiter is
// still required when a global limit must span replicas.
type TokenBucketV1 struct {
	mu       sync.Mutex
	rate     float64
	capacity float64
	tokens   float64
	last     time.Time
}

func NewTokenBucketV1(requestsPerSecond, burst int) *TokenBucketV1 {
	now := time.Now()
	return &TokenBucketV1{rate: float64(requestsPerSecond), capacity: float64(burst), tokens: float64(burst), last: now}
}

func (bucket *TokenBucketV1) Allow() bool {
	bucket.mu.Lock()
	defer bucket.mu.Unlock()
	now := time.Now()
	bucket.tokens += now.Sub(bucket.last).Seconds() * bucket.rate
	if bucket.tokens > bucket.capacity {
		bucket.tokens = bucket.capacity
	}
	bucket.last = now
	if bucket.tokens < 1 {
		return false
	}
	bucket.tokens--
	return true
}
