export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('auction_participants', {
    id: { type: 'uuid', primaryKey: true },
    auction_id: {
      type: 'uuid',
      notNull: true,
      references: '"auctions"',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    stripe_si_id: { type: 'varchar(255)' },
    payment_method_id: {
      type: 'uuid',
      references: '"payment_methods"',
      onDelete: 'SET NULL',
    },
    joined_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Unique constraint: one join per user per auction
  pgm.addConstraint('auction_participants', 'uq_auction_participants_auction_user', {
    unique: ['auction_id', 'user_id'],
  });

  pgm.createIndex('auction_participants', 'user_id', {
    name: 'idx_auction_participants_user_id',
  });
};

export const down = (pgm) => {
  pgm.dropTable('auction_participants');
};
