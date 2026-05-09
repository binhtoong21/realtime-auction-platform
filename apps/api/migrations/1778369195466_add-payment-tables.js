/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // ============================================================
  // Part 1: Refactor existing tables — DECIMAL(12,2) → BIGINT (cents)
  // ============================================================

  // auctions: convert money columns to BIGINT cents
  pgm.alterColumn('auctions', 'current_price', {
    type: 'BIGINT',
    using: '(current_price * 100)::BIGINT',
  });
  pgm.alterColumn('auctions', 'bid_increment', {
    type: 'BIGINT',
    using: '(bid_increment * 100)::BIGINT',
  });
  pgm.alterColumn('auctions', 'reserve_price', {
    type: 'BIGINT',
    using: '(reserve_price * 100)::BIGINT',
  });

  // bids: convert amount to BIGINT cents
  pgm.alterColumn('bids', 'amount', {
    type: 'BIGINT',
    using: '(amount * 100)::BIGINT',
  });

  // auctions: add updated_at (code already sets it but column was missing)
  pgm.addColumns('auctions', {
    updated_at: {
      type: 'timestamp',
      default: pgm.func('current_timestamp'),
    },
  });

  // ============================================================
  // Part 2: New tables for Payment & Stripe Integration
  // ============================================================

  // 1. payment_methods (created before payments due to FK reference)
  pgm.createTable('payment_methods', {
    id: { type: 'uuid', primaryKey: true },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    stripe_pm_id: { type: 'varchar(255)', notNull: true, unique: true },
    last4: { type: 'varchar(4)', notNull: true },
    brand: { type: 'varchar(50)', notNull: true },
    is_default: { type: 'boolean', notNull: true, default: false },
    expires_at: { type: 'timestamp' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('payment_methods', 'user_id');

  // 2. payments
  pgm.createTable('payments', {
    id: { type: 'uuid', primaryKey: true },
    auction_id: {
      type: 'uuid',
      notNull: true,
      references: '"auctions"',
      onDelete: 'CASCADE',
    },
    buyer_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    seller_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    amount: { type: 'BIGINT', notNull: true },
    platform_fee_amount: { type: 'BIGINT', notNull: true, default: 0 },
    stripe_pi_id: { type: 'varchar(255)', unique: true },
    payment_method_id: {
      type: 'uuid',
      references: '"payment_methods"',
      onDelete: 'SET NULL',
    },
    status: { type: 'varchar(50)', notNull: true, default: 'hold_pending' },
    grace_expires_at: { type: 'timestamp' },
    capture_attempts: { type: 'integer', notNull: true, default: 0 },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('payments', 'auction_id');
  pgm.createIndex('payments', 'buyer_id');

  // Partial index for active payment states (queries by status)
  pgm.sql(`
    CREATE INDEX idx_payments_active_status
    ON payments (status)
    WHERE status IN ('authorized', 'grace_period', 'second_chance', 'frozen', 'hold_pending');
  `);

  // 3. webhook_events (Stripe Idempotency Store)
  pgm.createTable('webhook_events', {
    id: { type: 'uuid', primaryKey: true },
    stripe_event_id: { type: 'varchar(255)', notNull: true, unique: true },
    event_type: { type: 'varchar(100)', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    status: { type: 'varchar(50)', notNull: true, default: 'received' },
    error_message: { type: 'text' },
    retry_count: { type: 'integer', notNull: true, default: 0 },
    processed_at: { type: 'timestamp' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('current_timestamp'),
    },
  });

  // Partial index for Reaper Job — finds stuck/pending_retry events
  pgm.sql(`
    CREATE INDEX idx_webhook_events_reaper
    ON webhook_events (status, updated_at)
    WHERE status IN ('processing', 'pending_retry');
  `);

  // 4. financial_audit_logs (immutable, append-only)
  pgm.createTable('financial_audit_logs', {
    id: { type: 'uuid', primaryKey: true },
    reference_id: { type: 'uuid', notNull: true },
    reference_type: { type: 'varchar(50)', notNull: true },
    action: { type: 'varchar(100)', notNull: true },
    delta_state: { type: 'jsonb' },
    actor_id: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    ip_address: { type: 'varchar(45)' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('financial_audit_logs', ['reference_id', 'reference_type']);
  pgm.createIndex('financial_audit_logs', [
    'action',
    { name: 'created_at', sort: 'DESC' },
  ]);

  // 5. platform_settings (key-value config store)
  pgm.createTable('platform_settings', {
    key: { type: 'varchar(100)', primaryKey: true },
    value: { type: 'jsonb', notNull: true },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('current_timestamp'),
    },
  });

  // Seed fee tiers (amounts in cents to match BIGINT convention)
  pgm.sql(`
    INSERT INTO platform_settings (key, value) VALUES (
      'fee_tiers',
      '[{"maxAmount": 10000, "rate": 0.10}, {"maxAmount": 100000, "rate": 0.07}, {"maxAmount": 1000000, "rate": 0.05}, {"maxAmount": null, "rate": 0.03}]'::jsonb
    );
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop new tables (reverse order of creation)
  pgm.dropTable('platform_settings');
  pgm.dropTable('financial_audit_logs');
  pgm.dropTable('webhook_events');
  pgm.dropTable('payments');
  pgm.dropTable('payment_methods');

  // Remove added column
  pgm.dropColumns('auctions', ['updated_at']);

  // Revert BIGINT cents → DECIMAL(12,2)
  pgm.alterColumn('bids', 'amount', {
    type: 'decimal(12, 2)',
    using: '(amount / 100.0)::decimal(12, 2)',
  });

  pgm.alterColumn('auctions', 'reserve_price', {
    type: 'decimal(12, 2)',
    using: '(reserve_price / 100.0)::decimal(12, 2)',
  });
  pgm.alterColumn('auctions', 'bid_increment', {
    type: 'decimal(12, 2)',
    using: '(bid_increment / 100.0)::decimal(12, 2)',
  });
  pgm.alterColumn('auctions', 'current_price', {
    type: 'decimal(12, 2)',
    using: '(current_price / 100.0)::decimal(12, 2)',
  });
};
