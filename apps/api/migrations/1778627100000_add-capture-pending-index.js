/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Drop existing partial index and recreate with capture_pending included.
  // The payment sweeper and emergency capture jobs use capture_pending as
  // a transitional state that needs to be queryable efficiently.
  pgm.sql('DROP INDEX IF EXISTS idx_payments_active_status;');
  pgm.sql(`
    CREATE INDEX idx_payments_active_status
    ON payments (status)
    WHERE status IN ('authorized', 'grace_period', 'second_chance', 'frozen',
                     'hold_pending', 'capture_pending');
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_payments_active_status;');
  pgm.sql(`
    CREATE INDEX idx_payments_active_status
    ON payments (status)
    WHERE status IN ('authorized', 'grace_period', 'second_chance', 'frozen', 'hold_pending');
  `);
};
