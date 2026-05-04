/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // 1. Create categories table
  pgm.createTable('categories', {
    id: { type: 'uuid', primaryKey: true },
    name: { type: 'varchar(100)', notNull: true },
    slug: { type: 'varchar(100)', notNull: true, unique: true },
    description: { type: 'text' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // 2. Add new columns to auctions table
  pgm.addColumns('auctions', {
    category_id: {
      type: 'uuid',
      references: '"categories"',
      onDelete: 'SET NULL',
    },
    description: { type: 'text' },
    images: { type: 'jsonb', notNull: true, default: '[]' },
    reserve_price: { type: 'decimal(12, 2)', notNull: true, default: 0 },
  });

  // Add index for category queries
  pgm.createIndex('auctions', 'category_id');
  pgm.createIndex('auctions', 'status'); // Helpful for cursor-based listing
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumns('auctions', ['category_id', 'description', 'images', 'reserve_price']);
  pgm.dropTable('categories');
};
