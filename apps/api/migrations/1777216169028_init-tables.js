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
  // 1. Users Table
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    auth_provider: { type: 'varchar(50)', notNull: true }, // 'email', 'google'
    kyc_status: { type: 'varchar(50)', default: 'pending' }, // 'pending', 'verified', 'failed'
    stripe_cus_id: { type: 'varchar(255)', unique: true },
    stripe_acct_id: { type: 'varchar(255)', unique: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // 2. Auctions Table
  pgm.createTable('auctions', {
    id: { type: 'uuid', primaryKey: true },
    seller_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    title: { type: 'varchar(255)', notNull: true },
    current_price: { type: 'decimal(12, 2)', notNull: true },
    bid_increment: { type: 'decimal(12, 2)', notNull: true },
    status: { type: 'varchar(50)', notNull: true, default: 'active' }, // 'active', 'ended', 'pending_payment', 'no_sale'
    start_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    end_at: { type: 'timestamp', notNull: true },
    extended_count: { type: 'integer', notNull: true, default: 0 },
    winner_id: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // 3. Bids Table
  pgm.createTable('bids', {
    id: { type: 'uuid', primaryKey: true },
    auction_id: {
      type: 'uuid',
      notNull: true,
      references: '"auctions"',
      onDelete: 'CASCADE',
    },
    bidder_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    amount: { type: 'decimal(12, 2)', notNull: true },
    idempotency_key: { type: 'varchar(255)', notNull: true, unique: true },
    is_winning: { type: 'boolean', notNull: true, default: false },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create Indexes
  pgm.createIndex('bids', ['auction_id', { name: 'amount', sort: 'DESC' }]);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('bids');
  pgm.dropTable('auctions');
  pgm.dropTable('users');
};
