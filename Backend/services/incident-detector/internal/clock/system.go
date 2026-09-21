package clock

import (
	"time"

	"github.com/sre-agent/incident-detector/internal/application"
)

var _ application.Clock = SystemClock{}

type SystemClock struct{}

func NewSystemClock() SystemClock { return SystemClock{} }

func (SystemClock) Now() time.Time { return time.Now() }
