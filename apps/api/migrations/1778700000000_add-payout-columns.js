/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Add payout tracking columns to payments table
  pgm.addColumns('payments', {
    stripe_transfer_id: { type: 'varchar(255)' },
    transferred_at: { type: 'timestamp' },
  });

  // Partial index for payout sweeper: only captured payments without a transfer
  pgm.sql(`
    CREATE INDEX idx_payments_payout_pending
    ON payments (status, updated_at)
    WHERE status = 'captured' AND stripe_transfer_id IS NULL;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_payments_payout_pending;');
  pgm.dropColumns('payments', ['stripe_transfer_id', 'transferred_at']);
};
