/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumns('auctions', {
    shipped_at: { type: 'timestamptz' },
    carrier: { type: 'varchar(50)' },
    tracking_number: { type: 'varchar(100)' },
    tracking_updated_at: { type: 'timestamptz' },
    shipping_deadline_at: { type: 'timestamptz' },
    shipping_extended: { type: 'boolean', default: false },
    delivered_at: { type: 'timestamptz' },
    delivery_deadline_at: { type: 'timestamptz' },
    delivery_extended: { type: 'boolean', default: false },
  });

  // Partial index for fulfillment sweeper (runs every 15 min)
  // Only scans auctions in active fulfillment states
  pgm.sql(`
    CREATE INDEX idx_auctions_fulfillment_sweeper
    ON auctions (status, shipping_deadline_at, delivery_deadline_at)
    WHERE status IN ('awaiting_ship', 'shipped');
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_auctions_fulfillment_sweeper;');
  pgm.dropColumns('auctions', [
    'shipped_at',
    'carrier',
    'tracking_number',
    'tracking_updated_at',
    'shipping_deadline_at',
    'shipping_extended',
    'delivered_at',
    'delivery_deadline_at',
    'delivery_extended',
  ]);
};
