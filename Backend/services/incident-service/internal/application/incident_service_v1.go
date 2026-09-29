package application

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/sre-agent/incident-service/internal/domain"
)

var (
	_ IncidentRecorder      = (*IncidentServiceV1)(nil)
	_ IncidentReader        = (*IncidentServiceV1)(nil)
	_ IncidentActionReader  = (*IncidentServiceV1)(nil)
	_ IncidentStatusManager = (*IncidentServiceV1)(nil)

	ErrInvalidIncident   = errors.New("fingerprint, service, and environment are required")
	ErrInvalidIncidentID = errors.New("incident id is invalid")
	ErrInvalidListQuery  = errors.New("incident list query is invalid")
	ErrIncidentNotFound  = errors.New("incident not found")
	ErrConcurrentUpdate  = errors.New("incident was updated concurrently")
)

type IncidentServiceV1 struct {
	repository   IncidentRepository
	statusPolicy IncidentStatusPolicy
}

func NewIncidentServiceV1(repository IncidentRepository, statusPolicy IncidentStatusPolicy) *IncidentServiceV1 {
	return &IncidentServiceV1{repository: repository, statusPolicy: statusPolicy}
}

func (service *IncidentServiceV1) Record(ctx context.Context, input domain.IncidentInput) (domain.Incident, error) {
	if strings.TrimSpace(input.Fingerprint) == "" || strings.TrimSpace(input.Service) == "" || strings.TrimSpace(input.Environment) == "" {
		return domain.Incident{}, ErrInvalidIncident
	}
	if strings.TrimSpace(input.Severity) == "" {
		input.Severity = "unknown"
	}
	return service.repository.Upsert(ctx, input)
}

func (service *IncidentServiceV1) Get(ctx context.Context, incidentID string) (domain.Incident, error) {
	if !validIncidentID(incidentID) {
		return domain.Incident{}, ErrInvalidIncidentID
	}
	return service.repository.FindByID(ctx, incidentID)
}

func (service *IncidentServiceV1) List(ctx context.Context, request ListIncidentsRequest) (domain.IncidentPage, error) {
	if request.Limit == 0 {
		request.Limit = 50
	}
	if request.Limit < 1 || request.Limit > 200 {
		return domain.IncidentPage{}, ErrInvalidListQuery
	}
	if request.Status != "" {
		if err := service.statusPolicy.Validate(request.Status); err != nil {
			return domain.IncidentPage{}, errors.Join(ErrInvalidListQuery, err)
		}
	}
	query := domain.IncidentListQuery{Status: request.Status, Service: request.Service, Limit: request.Limit + 1}
	if request.Cursor != "" {
		lastSeen, incidentID, err := decodeCursor(request.Cursor)
		if err != nil {
			return domain.IncidentPage{}, errors.Join(ErrInvalidListQuery, err)
		}
		query.BeforeLastSeen, query.BeforeID = lastSeen, incidentID
	}
	items, err := service.repository.ListIncidents(ctx, query)
	if err != nil {
		return domain.IncidentPage{}, err
	}
	page := domain.IncidentPage{Items: items}
	if len(items) > request.Limit {
		page.Items = items[:request.Limit]
		last := page.Items[len(page.Items)-1]
		page.NextCursor = encodeCursor(last.LastSeenAt, last.ID)
	}
	return page, nil
}

func (service *IncidentServiceV1) ListOccurrences(ctx context.Context, incidentID string, limit int) ([]domain.IncidentOccurrence, error) {
	if !validIncidentID(incidentID) {
		return nil, ErrInvalidIncidentID
	}
	if limit == 0 {
		limit = 100
	}
	if limit < 1 || limit > 500 {
		return nil, ErrInvalidListQuery
	}
	return service.repository.ListOccurrences(ctx, incidentID, limit)
}

func (service *IncidentServiceV1) ListOccurrencePage(ctx context.Context, incidentID string, limit int, cursor string) (domain.IncidentOccurrencePage, error) {
	if !validIncidentID(incidentID) {
		return domain.IncidentOccurrencePage{}, ErrInvalidIncidentID
	}
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 100 {
		return domain.IncidentOccurrencePage{}, ErrInvalidListQuery
	}
	query := domain.IncidentOccurrenceQuery{IncidentID: incidentID, Limit: limit + 1}
	if cursor != "" {
		observedAt, occurrenceID, err := decodeOccurrenceCursor(cursor)
		if err != nil {
			return domain.IncidentOccurrencePage{}, errors.Join(ErrInvalidListQuery, err)
		}
		query.BeforeObservedAt, query.BeforeID = observedAt, occurrenceID
	}
	items, err := service.repository.ListOccurrencePage(ctx, query)
	if err != nil {
		return domain.IncidentOccurrencePage{}, err
	}
	page := domain.IncidentOccurrencePage{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		last := page.Items[len(page.Items)-1]
		page.NextCursor = encodeOccurrenceCursor(last.ObservedAt, last.ID)
	}
	return page, nil
}

func (service *IncidentServiceV1) AllowedActions(ctx context.Context, incidentID string) (domain.IncidentActions, error) {
	if !validIncidentID(incidentID) {
		return domain.IncidentActions{}, ErrInvalidIncidentID
	}
	incident, err := service.repository.FindByID(ctx, incidentID)
	if err != nil {
		return domain.IncidentActions{}, err
	}
	return domain.IncidentActions{
		IncidentID: incident.ID, CurrentStatus: incident.Status,
		AllowedActions: service.statusPolicy.AllowedTransitions(incident.Status),
	}, nil
}

func (service *IncidentServiceV1) UpdateStatus(ctx context.Context, incidentID, next string) (domain.Incident, error) {
	if !validIncidentID(incidentID) {
		return domain.Incident{}, ErrInvalidIncidentID
	}
	current, err := service.repository.FindByID(ctx, incidentID)
	if err != nil {
		return domain.Incident{}, err
	}
	if err := service.statusPolicy.ValidateTransition(current.Status, next); err != nil {
		return domain.Incident{}, err
	}
	return service.repository.UpdateStatus(ctx, incidentID, current.Status, next)
}

func validIncidentID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for index, character := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			if character != '-' {
				return false
			}
			continue
		}
		if !((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f') || (character >= 'A' && character <= 'F')) {
			return false
		}
	}
	return true
}

func encodeCursor(lastSeen time.Time, incidentID string) string {
	value := strconv.FormatInt(lastSeen.UTC().UnixNano(), 10) + ":" + incidentID
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decodeCursor(cursor string) (time.Time, string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("decode cursor: %w", err)
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 || !validIncidentID(parts[1]) {
		return time.Time{}, "", errors.New("invalid cursor")
	}
	nanoseconds, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return time.Time{}, "", errors.New("invalid cursor timestamp")
	}
	return time.Unix(0, nanoseconds).UTC(), parts[1], nil
}

func encodeOccurrenceCursor(observedAt time.Time, occurrenceID int64) string {
	value := strconv.FormatInt(observedAt.UTC().UnixNano(), 10) + ":" + strconv.FormatInt(occurrenceID, 10)
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decodeOccurrenceCursor(cursor string) (time.Time, int64, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, 0, fmt.Errorf("decode occurrence cursor: %w", err)
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return time.Time{}, 0, errors.New("invalid occurrence cursor")
	}
	nanoseconds, timeErr := strconv.ParseInt(parts[0], 10, 64)
	occurrenceID, idErr := strconv.ParseInt(parts[1], 10, 64)
	if timeErr != nil || idErr != nil || occurrenceID < 1 {
		return time.Time{}, 0, errors.New("invalid occurrence cursor values")
	}
	return time.Unix(0, nanoseconds).UTC(), occurrenceID, nil
}
