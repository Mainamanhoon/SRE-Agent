package clock

import (
	"time"

	"github.com/sre-agent/repair-run-service/internal/application"
)

var _ application.RepairRunClock = SystemClockV1{}

type SystemClockV1 struct{}

func (SystemClockV1) Now() time.Time { return time.Now().UTC() }
