package application

import (
	"errors"
	"fmt"
)

var ErrInvalidStatusTransition = errors.New("invalid incident status transition")

type IncidentStatusPolicyV1 struct{}

var _ IncidentStatusPolicy = IncidentStatusPolicyV1{}

func (IncidentStatusPolicyV1) Validate(status string) error {
	valid := map[string]bool{
		"open": true, "investigating": true, "repairing": true, "resolved": true,
		"ignored": true, "failed": true, "abstained": true, "awaiting_review": true,
	}
	if !valid[status] {
		return fmt.Errorf("%w: unknown status %q", ErrInvalidStatusTransition, status)
	}
	return nil
}

func (IncidentStatusPolicyV1) ValidateTransition(current, next string) error {
	if err := (IncidentStatusPolicyV1{}).Validate(next); err != nil {
		return err
	}
	if current == next {
		return nil
	}
	allowed := map[string]map[string]bool{
		"open":            {"investigating": true, "ignored": true, "resolved": true},
		"investigating":   {"repairing": true, "abstained": true, "failed": true, "resolved": true},
		"repairing":       {"awaiting_review": true, "resolved": true, "failed": true, "open": true},
		"awaiting_review": {"resolved": true, "failed": true, "open": true},
		"failed":          {"investigating": true, "ignored": true},
		"abstained":       {"investigating": true, "ignored": true},
		"resolved":        {"open": true},
		"ignored":         {"open": true},
	}
	if !allowed[current][next] {
		return fmt.Errorf("%w: %s -> %s", ErrInvalidStatusTransition, current, next)
	}
	return nil
}
