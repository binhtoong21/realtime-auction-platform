/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Add composite partial indexes for cursor-based pagination across all sort modes.
 *
 * Trade-off: DROP + CREATE in a single transaction takes an ACCESS EXCLUSIVE lock
 * on the auctions table. Acceptable at current scale (graduation project, no
 * production traffic). For large tables under load, use CREATE INDEX CONCURRENTLY
 * (requires noTransaction: true in node-pg-migrate, adds operational complexity).
 *
 * Note: These are partial indexes filtered by status = 'active'. Admin queries
 * that list auctions across all statuses will NOT benefit from these indexes —
 * a non-partial index should be added in Sprint 4 PR #12a/12b if needed.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = async (pgm) => {
  // For sort=ending_soon: ORDER BY end_at ASC, id ASC
  pgm.createIndex('auctions', [{ name: 'end_at', sort: 'ASC' }, { name: 'id', sort: 'ASC' }], {
    name: 'idx_auctions_active_ending',
    where: "status = 'active'",
  });

  // For sort=price_asc: ORDER BY current_price ASC, id ASC
  // Postgres can backward-scan this same index for price_desc (DESC, DESC),
  // so a single index covers both directions.
  pgm.createIndex('auctions', [{ name: 'current_price', sort: 'ASC' }, { name: 'id', sort: 'ASC' }], {
    name: 'idx_auctions_active_price',
    where: "status = 'active'",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = async (pgm) => {
  pgm.dropIndex('auctions', [], { name: 'idx_auctions_active_price' });
  pgm.dropIndex('auctions', [], { name: 'idx_auctions_active_ending' });
};
