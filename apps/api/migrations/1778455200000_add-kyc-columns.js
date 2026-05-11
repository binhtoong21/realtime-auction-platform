export const shorthands = undefined;

export const up = (pgm) => {
  // Drop old kyc_status column (replaced by identity_status + connect_status)
  pgm.dropColumn('users', 'kyc_status');

  // Add Stripe Identity columns
  pgm.addColumns('users', {
    stripe_identity_session_id: { type: 'varchar(255)' },
    identity_status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'not_started',
    },
    identity_failure_reason: { type: 'varchar(255)' },
    identity_verified_at: { type: 'timestamptz' },
    identity_retry_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
  });

  // Add Stripe Connect columns
  pgm.addColumns('users', {
    connect_status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'not_started',
    },
    connect_onboarded_at: { type: 'timestamptz' },
  });

  pgm.createIndex('users', 'identity_status', {
    name: 'idx_users_identity_status',
  });
  pgm.createIndex('users', 'connect_status', {
    name: 'idx_users_connect_status',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('users', 'connect_status', {
    name: 'idx_users_connect_status',
  });
  pgm.dropIndex('users', 'identity_status', {
    name: 'idx_users_identity_status',
  });

  pgm.dropColumns('users', [
    'connect_onboarded_at',
    'connect_status',
    'identity_retry_count',
    'identity_verified_at',
    'identity_failure_reason',
    'identity_status',
    'stripe_identity_session_id',
  ]);

  pgm.addColumn('users', {
    kyc_status: { type: 'varchar(50)', default: 'pending' },
  });
};
