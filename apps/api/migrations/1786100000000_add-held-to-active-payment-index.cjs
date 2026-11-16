/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_payments_active_status');
  pgm.sql(`
    CREATE INDEX idx_payments_active_status
    ON payments (status)
    WHERE status IN ('held', 'authorized', 'grace_period', 'second_chance', 'frozen', 'hold_pending');
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_payments_active_status');
  pgm.sql(`
    CREATE INDEX idx_payments_active_status
    ON payments (status)
    WHERE status IN ('authorized', 'grace_period', 'second_chance', 'frozen', 'hold_pending');
  `);
};
