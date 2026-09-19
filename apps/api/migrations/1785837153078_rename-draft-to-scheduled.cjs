/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Update existing data
  pgm.sql(`UPDATE auctions SET status = 'scheduled' WHERE status = 'draft'`);
  // Clean up illogical state where active auctions have future start times
  pgm.sql(`UPDATE auctions SET status = 'scheduled' WHERE status = 'active' AND start_at > NOW()`);
  // Update the default value for the status column
  pgm.alterColumn('auctions', 'status', { default: 'scheduled' });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`UPDATE auctions SET status = 'draft' WHERE status = 'scheduled'`);
  pgm.alterColumn('auctions', 'status', { default: 'active' });
};
