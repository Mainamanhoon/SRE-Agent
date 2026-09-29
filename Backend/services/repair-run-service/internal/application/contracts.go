package application

import (
	"context"
	"errors"
	"time"

	"github.com/sre-agent/repair-run-service/internal/domain"
)

var (
	ErrInvalidInput        = errors.New("invalid repair run input")
	ErrNotFound            = errors.New("repair run not found")
	ErrIdempotencyConflict = errors.New("idempotency key conflicts with existing request")
	ErrConcurrentUpdate    = errors.New("repair run was concurrently updated")
	ErrInvalidTransition   = errors.New("invalid repair run status transition")
	ErrMetadata            = errors.New("repair run event metadata is invalid")
)

type RepairRunRepository interface {
	Create(context.Context, domain.CreateInput) (domain.RepairRun, error)
	Get(context.Context, string) (domain.RepairRun, error)
	List(context.Context, domain.ListQuery) (domain.RunPage, error)
	AppendEvent(context.Context, domain.AppendEventInput) (domain.RunEvent, error)
	ListEvents(context.Context, string, int64, int) (domain.EventPage, error)
	Update(context.Context, domain.UpdateInput) (domain.RepairRun, error)
	Ping(context.Context) error
}

type RepairRunClock interface {
	Now() time.Time
}

type RequestAuthenticator interface {
	Authenticate(string) bool
}

type RequestLimiter interface {
	Allow() bool
}

type RepairRunMetrics interface {
	Observe(string)
	Prometheus() string
}
