/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // 1. Create notifications table
  pgm.createTable('notifications', {
    id: { type: 'uuid', primaryKey: true },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    type: { type: 'varchar(50)', notNull: true },
    title: { type: 'varchar(255)' },
    message: { type: 'text' },
    reference_id: { type: 'uuid' },
    reference_type: { type: 'varchar(50)' },
    payload: { type: 'jsonb' },
    is_read: { type: 'boolean', notNull: true, default: false },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('notifications', ['user_id', 'created_at']);
  pgm.createIndex('notifications', ['user_id', 'is_read']);

  // 2. Add avatar_url to users table
  pgm.addColumns('users', {
    avatar_url: { type: 'varchar(500)' },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumns('users', ['avatar_url']);
  pgm.dropTable('notifications');
};
