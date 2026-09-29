package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sre-agent/github-app/internal/application"
	"github.com/sre-agent/github-app/internal/domain"
)

var _ application.WebhookDeliveryStore = (*WebhookDeliveryStoreV1)(nil)

type WebhookDeliveryStoreV1 struct{ pool *pgxpool.Pool }

func NewWebhookDeliveryStoreV1(pool *pgxpool.Pool) *WebhookDeliveryStoreV1 {
	return &WebhookDeliveryStoreV1{pool: pool}
}

func (store *WebhookDeliveryStoreV1) Ping(ctx context.Context) error { return store.pool.Ping(ctx) }

func (store *WebhookDeliveryStoreV1) Accept(ctx context.Context, delivery domain.WebhookDelivery) (bool, error) {
	var inserted string
	err := store.pool.QueryRow(ctx, `INSERT INTO github_webhook_deliveries (
		delivery_id,event_name,action_name,payload_sha256,installation_id,repository,repair_run_id,
		pull_request_number,merged,merge_commit_sha,head_commit_sha,review_state
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
	ON CONFLICT (delivery_id) DO NOTHING RETURNING delivery_id`, delivery.ID, delivery.Event, delivery.Action,
		delivery.PayloadSHA256, delivery.InstallationID, delivery.Repository, delivery.RepairRunID,
		delivery.PullRequestNumber, delivery.Merged, delivery.MergeCommit, delivery.HeadCommitSHA, delivery.ReviewState).Scan(&inserted)
	if err == nil {
		return true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	var existingHash, existingEvent string
	if err = store.pool.QueryRow(ctx, `SELECT payload_sha256,event_name FROM github_webhook_deliveries WHERE delivery_id=$1`, delivery.ID).Scan(&existingHash, &existingEvent); err != nil {
		return false, err
	}
	if existingHash != delivery.PayloadSHA256 || existingEvent != delivery.Event {
		return false, application.ErrWebhookConflict
	}
	return false, nil
}

func (store *WebhookDeliveryStoreV1) Claim(ctx context.Context, workerID string) (domain.WebhookDelivery, bool, error) {
	const statement = `UPDATE github_webhook_deliveries SET
		state='processing',attempt_count=attempt_count+1,lease_owner=$1,
		lease_until=NOW()+INTERVAL '30 seconds',updated_at=NOW()
	WHERE delivery_id=(
		SELECT delivery_id FROM github_webhook_deliveries
		WHERE (state='pending' AND next_attempt_at<=NOW()) OR (state='processing' AND lease_until<NOW())
		ORDER BY received_at,delivery_id FOR UPDATE SKIP LOCKED LIMIT 1
	)
	RETURNING delivery_id,event_name,action_name,payload_sha256,installation_id,repository,repair_run_id,
		pull_request_number,merged,merge_commit_sha,head_commit_sha,review_state,attempt_count`
	var delivery domain.WebhookDelivery
	err := store.pool.QueryRow(ctx, statement, workerID).Scan(
		&delivery.ID, &delivery.Event, &delivery.Action, &delivery.PayloadSHA256, &delivery.InstallationID,
		&delivery.Repository, &delivery.RepairRunID, &delivery.PullRequestNumber, &delivery.Merged,
		&delivery.MergeCommit, &delivery.HeadCommitSHA, &delivery.ReviewState, &delivery.Attempt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WebhookDelivery{}, false, nil
	}
	return delivery, err == nil, err
}

func (store *WebhookDeliveryStoreV1) Complete(ctx context.Context, deliveryID, workerID string) error {
	command, err := store.pool.Exec(ctx, `UPDATE github_webhook_deliveries SET state='processed',lease_owner='',lease_until=NULL,updated_at=NOW()
		WHERE delivery_id=$1 AND state='processing' AND lease_owner=$2`, deliveryID, workerID)
	if err != nil {
		return err
	}
	if command.RowsAffected() != 1 {
		return errors.New("webhook outbox lease was lost before completion")
	}
	return nil
}

func (store *WebhookDeliveryStoreV1) Retry(ctx context.Context, deliveryID, workerID, reasonCode string, attempt int) error {
	delay := application.WebhookRetryDelay(attempt)
	command, err := store.pool.Exec(ctx, `UPDATE github_webhook_deliveries SET
		state=CASE WHEN attempt_count >= 20 THEN 'dead' ELSE 'pending' END,
		lease_owner='',lease_until=NULL,next_attempt_at=NOW()+$3::interval,
		last_error_code=$4,updated_at=NOW()
		WHERE delivery_id=$1 AND state='processing' AND lease_owner=$2`, deliveryID, workerID,
		fmt.Sprintf("%f seconds", delay.Seconds()), reasonCode)
	if err != nil {
		return err
	}
	if command.RowsAffected() != 1 {
		return errors.New("webhook outbox lease was lost before retry")
	}
	return nil
}

func (store *WebhookDeliveryStoreV1) SetInstallationAvailable(ctx context.Context, installationID int64, active bool) error {
	if installationID <= 0 {
		return errors.New("invalid installation id")
	}
	_, err := store.pool.Exec(ctx, `INSERT INTO github_installation_state (installation_id,active,updated_at)
		VALUES ($1,$2,NOW()) ON CONFLICT (installation_id) DO UPDATE SET active=EXCLUDED.active,updated_at=NOW()`, installationID, active)
	return err
}

func (store *WebhookDeliveryStoreV1) InstallationAvailable(ctx context.Context, installationID int64) (bool, error) {
	var active bool
	err := store.pool.QueryRow(ctx, `SELECT COALESCE((SELECT active FROM github_installation_state WHERE installation_id=$1),TRUE)`, installationID).Scan(&active)
	return active, err
}
