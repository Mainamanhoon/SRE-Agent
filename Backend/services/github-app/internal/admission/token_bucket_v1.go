package admission

import (
	"github.com/sre-agent/github-app/internal/application"
	"sync"
	"time"
)

var _ application.RequestLimiter = (*TokenBucketV1)(nil)

type TokenBucketV1 struct {
	mu                     sync.Mutex
	rate, capacity, tokens float64
	last                   time.Time
}

func NewTokenBucketV1(rate, burst int) *TokenBucketV1 {
	return &TokenBucketV1{rate: float64(rate), capacity: float64(burst), tokens: float64(burst), last: time.Now()}
}
func (bucket *TokenBucketV1) Allow() bool {
	bucket.mu.Lock()
	defer bucket.mu.Unlock()
	now := time.Now()
	bucket.tokens += now.Sub(bucket.last).Seconds() * bucket.rate
	bucket.last = now
	if bucket.tokens > bucket.capacity {
		bucket.tokens = bucket.capacity
	}
	if bucket.tokens < 1 {
		return false
	}
	bucket.tokens--
	return true
}
