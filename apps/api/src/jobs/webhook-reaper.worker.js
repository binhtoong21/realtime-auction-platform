import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';
import { processWebhookEvent } from '../services/webhook.service.js';
import { emitToAdmin } from '../services/socket.service.js';

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const MAX_RETRIES = 3;

/**
 * Webhook Reaper Worker — Recovers stuck and out-of-order webhook events.
 *
 * Runs as a repeatable job every 5 minutes.
 *
 * Targets:
 *   - 'processing': Events where the handler crashed mid-execution
 *   - 'pending_retry': Out-of-order events waiting for prerequisite state changes
 *
 * Safety: All handlers use State Guard (WHERE status = 'expected_state').
 * If a partially-processed event is retried, the guard skips completed parts.
 */
const webhookReaperWorker = new Worker('webhook', async (job) => {
  if (job.name !== 'webhook-reaper') {
    console.warn(`[WebhookReaper] Unknown job name: ${job.name}`);
    return;
  }

  console.log('[WebhookReaper] Starting reaper scan...');

  const result = await pool.query(
    `SELECT id, stripe_event_id, event_type, payload, status, retry_count
     FROM webhook_events
     WHERE status IN ('processing', 'pending_retry')
       AND updated_at < NOW() - INTERVAL '5 minutes'
     ORDER BY created_at ASC
     LIMIT 50`
  );

  if (result.rows.length === 0) {
    console.log('[WebhookReaper] No stuck events found.');
    return;
  }

  console.log(`[WebhookReaper] Found ${result.rows.length} stuck event(s). Processing...`);

  let recovered = 0;
  let exhausted = 0;
  let failed = 0;

  for (const event of result.rows) {
    if (event.retry_count >= MAX_RETRIES) {
      // Max retries exceeded — mark as permanently failed (with state guard)
      const exhaustResult = await pool.query(
        `UPDATE webhook_events
         SET status = 'failed',
             error_message = 'Max retries exceeded (' || retry_count || '/' || $1 || ')',
             updated_at = NOW()
         WHERE id = $2 AND status IN ('processing', 'pending_retry')
         RETURNING id`,
        [MAX_RETRIES, event.id]
      );

      if (exhaustResult.rowCount === 0) {
        // Already transitioned by another process (e.g., route completed it)
        continue;
      }

      try {
        await emitToAdmin('webhook:max-retries', {
          eventId: event.id,
          stripeEventId: event.stripe_event_id,
          eventType: event.event_type,
          retryCount: event.retry_count,
        });
      } catch (emitErr) {
        // Non-critical — don't let notification failure block reaper
      }

      console.error(
        `[WebhookReaper] Event exhausted retries: ${event.stripe_event_id} ` +
        `(type=${event.event_type}, retries=${event.retry_count})`
      );
      exhausted++;
      continue;
    }

    // Atomic claim: only transition if still in expected state
    const claimResult = await pool.query(
      `UPDATE webhook_events
       SET status = 'processing',
           retry_count = retry_count + 1,
           updated_at = NOW()
       WHERE id = $1 AND status IN ('processing', 'pending_retry')
       RETURNING id`,
      [event.id]
    );

    if (claimResult.rowCount === 0) {
      // Another reaper instance or route already handled this event
      console.log(`[WebhookReaper] Event ${event.stripe_event_id} already claimed, skipping.`);
      continue;
    }

    // Process event
    try {
      const stripeEvent = {
        id: event.stripe_event_id,
        type: event.event_type,
        data: event.payload,
      };

      await processWebhookEvent(stripeEvent);
    } catch (err) {
      const status = err.code === 'STATE_GUARD_FAILED' ? 'pending_retry' : 'failed';

      try {
        await pool.query(
          `UPDATE webhook_events
           SET status = $1, error_message = $2, updated_at = NOW()
           WHERE id = $3 AND status = 'processing'`,
          [status, err.message, event.id]
        );
      } catch (dbErr) {
        console.error(`[WebhookReaper] Failed to update event ${event.stripe_event_id} status:`, dbErr.message);
      }

      if (status === 'failed') {
        failed++;
      }

      console.error(
        `[WebhookReaper] Retry failed for ${event.stripe_event_id}: ${err.message} → ${status}`
      );
      continue;
    }

    // Business logic succeeded — mark as completed
    try {
      const completeResult = await pool.query(
        `UPDATE webhook_events
         SET status = 'completed', processed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'processing'
         RETURNING id`,
        [event.id]
      );

      if (completeResult.rowCount === 0) {
        console.warn(`[WebhookReaper] Event ${event.stripe_event_id} status changed during processing, skip marking completed.`);
      } else {
        recovered++;
      }
    } catch (dbErr) {
      // Processing succeeded but DB update failed — reaper will re-pick this
      // event next scan, and State Guards ensure idempotent re-processing.
      console.error(`[WebhookReaper] Failed to mark event ${event.stripe_event_id} completed:`, dbErr.message);
    }
  }

  console.log(
    `[WebhookReaper] Scan complete: recovered=${recovered}, exhausted=${exhausted}, failed=${failed}`
  );
}, {
  connection,
  concurrency: 1, // Only one reaper scan at a time
});

webhookReaperWorker.on('completed', (job) => {
  // Repeatable jobs complete frequently — only log at debug level
});

webhookReaperWorker.on('failed', (job, err) => {
  console.error(`[WebhookReaper] Job ${job?.id} failed:`, err.message);
});

export default webhookReaperWorker;
