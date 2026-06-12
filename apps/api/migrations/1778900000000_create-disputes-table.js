/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('disputes', {
    id: { type: 'uuid', primaryKey: true },
    payment_id: { type: 'uuid', notNull: true, references: '"payments"', onDelete: 'RESTRICT' },
    auction_id: { type: 'uuid', notNull: true, references: '"auctions"', onDelete: 'RESTRICT' },
    opened_by: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'RESTRICT' },
    reason: { type: 'varchar(50)', notNull: true },
    description: { type: 'text' },
    evidence_urls: { type: 'text[]' },
    status: { type: 'varchar(50)', notNull: true, default: 'open' },
    resolution_note: { type: 'text' },
    policy_rule: { type: 'varchar(100)' },
    resolved_by: { type: 'uuid', references: '"users"', onDelete: 'RESTRICT' },
    resolved_at: { type: 'timestamptz' },
    deadline_at: { type: 'timestamptz', notNull: true },
    seller_evidence_deadline_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamptz', default: pgm.func('current_timestamp') },
  });

  // Constraints
  pgm.addConstraint('disputes', 'chk_disputes_resolution', {
    check: "(status IN ('resolved_buyer_wins', 'resolved_seller_wins') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL) OR (status NOT IN ('resolved_buyer_wins', 'resolved_seller_wins') AND resolved_by IS NULL AND resolved_at IS NULL)",
  });

  // Prevent duplicate disputes per payment (strictly one-shot)
  pgm.createIndex('disputes', 'payment_id', {
    name: 'idx_disputes_one_per_payment',
    unique: true,
  });

  // Foreign key / general lookups
  pgm.createIndex('disputes', 'auction_id', { name: 'idx_disputes_auction_id' });
  pgm.createIndex('disputes', 'opened_by', { name: 'idx_disputes_opened_by' });

  // Partial index for Dispute Expiry Sweeper
  pgm.sql(`
    CREATE INDEX idx_disputes_status_deadline
    ON disputes (status, deadline_at)
    WHERE status IN ('open', 'under_review');
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_disputes_status_deadline;');
  pgm.dropIndex('disputes', 'opened_by', { name: 'idx_disputes_opened_by' });
  pgm.dropIndex('disputes', 'auction_id', { name: 'idx_disputes_auction_id' });
  pgm.dropIndex('disputes', 'payment_id', { name: 'idx_disputes_one_per_payment' });
  pgm.dropConstraint('disputes', 'chk_disputes_resolution');
  pgm.dropTable('disputes');
};
