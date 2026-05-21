import { Router } from 'express';
import express from 'express';
import { v7 as uuidv7 } from 'uuid';
import stripe from '../config/stripe.js';
import { pool } from '../config/database.js';
import { processWebhookEvent } from '../services/webhook.service.js';

const router = Router();

// Stripe requires raw body for signature verification
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      if (process.env.STRIPE_WEBHOOK_SECRET) {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } else {
        // Dev mode: parse body directly (no signature verification)
        event = JSON.parse(req.body.toString());
      }
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    // Idempotency check via webhook_events table
    try {
      await pool.query(
        `INSERT INTO webhook_events (id, stripe_event_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, 'processing')`,
        [uuidv7(), event.id, event.type, JSON.stringify(event.data)]
      );
    } catch (err) {
      if (err.code === '23505') {
        // Duplicate event — already processed
        return res.status(200).json({ received: true, duplicate: true });
      }
      console.error('[Webhook] DB error during idempotency check:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }

    try {
      await processWebhookEvent(event);

      await pool.query(
        `UPDATE webhook_events SET status = 'completed', processed_at = NOW(), updated_at = NOW()
         WHERE stripe_event_id = $1`,
        [event.id]
      );
    } catch (err) {
      console.error(`[Webhook] Error processing ${event.type}:`, err.message);

      const status = err.code === 'STATE_GUARD_FAILED' ? 'pending_retry' : 'failed';

      await pool.query(
        `UPDATE webhook_events SET status = $1, error_message = $2, updated_at = NOW()
         WHERE stripe_event_id = $3`,
        [status, err.message, event.id]
      );
    }

    res.status(200).json({ received: true });
  }
);

export default router;
