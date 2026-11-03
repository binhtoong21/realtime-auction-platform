/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('watchlist', {
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    auction_id: {
      type: 'uuid',
      notNull: true,
      references: '"auctions"',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.addConstraint('watchlist', 'pk_watchlist', {
    primaryKey: ['user_id', 'auction_id'],
  });

  pgm.createIndex('watchlist', ['user_id', 'created_at'], {
    name: 'idx_watchlist_user_created',
  });
  pgm.createIndex('watchlist', 'auction_id', {
    name: 'idx_watchlist_auction_id',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('watchlist');
};
