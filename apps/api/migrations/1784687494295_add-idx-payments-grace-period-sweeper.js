/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = async (pgm) => {
  pgm.createIndex('payments', ['grace_expires_at'], {
    name: 'idx_payments_grace_period_sweeper',
    where: "status = 'grace_period'",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = async (pgm) => {
  pgm.dropIndex('payments', ['grace_expires_at'], {
    name: 'idx_payments_grace_period_sweeper',
  });
};
