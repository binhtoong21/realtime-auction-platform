/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = async (pgm) => {
  pgm.noTransaction();

  try {
    pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_payments_active_status_v2;');
    
    pgm.sql(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_active_status_v2
      ON payments (status)
      WHERE status IN ('authorized', 'grace_period', 'second_chance', 'frozen',
                       'hold_pending', 'capture_pending');
    `);

    pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_payments_active_status;');
    pgm.sql('ALTER INDEX IF EXISTS idx_payments_active_status_v2 RENAME TO idx_payments_active_status;');
  } catch (err) {
    // Basic rollback effort if the non-transactional step fails halfway
    pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_payments_active_status_v2;');
    throw err;
  }
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = async (pgm) => {
  pgm.noTransaction();

  try {
    pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_payments_active_status_v2;');
    
    pgm.sql(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_active_status_v2
      ON payments (status)
      WHERE status IN ('authorized', 'grace_period', 'second_chance', 'frozen', 'hold_pending');
    `);

    pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_payments_active_status;');
    pgm.sql('ALTER INDEX IF EXISTS idx_payments_active_status_v2 RENAME TO idx_payments_active_status;');
  } catch (err) {
    pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_payments_active_status_v2;');
    throw err;
  }
};
