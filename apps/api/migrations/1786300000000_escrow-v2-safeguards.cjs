/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  // Manual-capture (auth hold) payments are no longer processed by any code path.
  // Fail fast instead of leaving them stuck silently after deploy.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM payments WHERE status IN ('authorized', 'capture_pending')) THEN
        RAISE EXCEPTION 'Legacy manual-capture payments exist (authorized/capture_pending). Settle or migrate them before deploying escrow v2.';
      END IF;
    END $$;
  `);
  pgm.sql('CREATE UNIQUE INDEX uq_payments_auction_id ON payments (auction_id)');
  pgm.sql('ALTER TABLE payment_attempts ADD COLUMN stripe_last_requested_at timestamptz');
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.sql('ALTER TABLE payment_attempts DROP COLUMN stripe_last_requested_at');
  pgm.sql('DROP INDEX IF EXISTS uq_payments_auction_id');
};
