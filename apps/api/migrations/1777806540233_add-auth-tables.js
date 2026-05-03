/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  // 1. Add columns to existing users table
  pgm.addColumns('users', {
    password_hash: { type: 'varchar(255)' },
    display_name: { type: 'varchar(100)' },
    role: { type: 'varchar(20)', notNull: true, default: 'user' },
    status: { type: 'varchar(20)', notNull: true, default: 'unverified' },
    banned_at: { type: 'timestamp' },
    ban_reason: { type: 'text' },
    failed_login_attempts: { type: 'integer', notNull: true, default: 0 },
    locked_until: { type: 'timestamp' },
  });

  // 2. Refresh Tokens table
  pgm.createTable('refresh_tokens', {
    id: { type: 'uuid', primaryKey: true },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'varchar(255)', notNull: true },
    expires_at: { type: 'timestamp', notNull: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    revoked_at: { type: 'timestamp' },
  });

  pgm.createIndex('refresh_tokens', 'user_id');
  pgm.createIndex('refresh_tokens', 'token_hash');

  // 3. Email Verification Tokens table
  pgm.createTable('email_verification_tokens', {
    id: { type: 'uuid', primaryKey: true },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'varchar(255)', notNull: true, unique: true },
    expires_at: { type: 'timestamp', notNull: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    used_at: { type: 'timestamp' },
  });

  // 4. Password Reset Tokens table
  pgm.createTable('password_reset_tokens', {
    id: { type: 'uuid', primaryKey: true },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'varchar(255)', notNull: true, unique: true },
    expires_at: { type: 'timestamp', notNull: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    used_at: { type: 'timestamp' },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('password_reset_tokens');
  pgm.dropTable('email_verification_tokens');
  pgm.dropTable('refresh_tokens');
  pgm.dropColumns('users', [
    'password_hash',
    'display_name',
    'role',
    'status',
    'banned_at',
    'ban_reason',
    'failed_login_attempts',
    'locked_until',
  ]);
};
