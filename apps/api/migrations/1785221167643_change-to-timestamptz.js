export const shorthands = undefined;

export const up = (pgm) => {
  const columns = [
    ['refresh_tokens', 'expires_at'],
    ['refresh_tokens', 'created_at'],
    ['refresh_tokens', 'revoked_at'],
    ['email_verification_tokens', 'expires_at'],
    ['email_verification_tokens', 'created_at'],
    ['email_verification_tokens', 'used_at'],
    ['password_reset_tokens', 'expires_at'],
    ['password_reset_tokens', 'created_at'],
    ['password_reset_tokens', 'used_at'],
    ['categories', 'created_at'],
    ['bids', 'created_at'],
    ['webhook_events', 'processed_at'],
    ['webhook_events', 'created_at'],
    ['webhook_events', 'updated_at'],
    ['payment_methods', 'expires_at'],
    ['payment_methods', 'created_at'],
    ['platform_settings', 'updated_at'],
    ['users', 'created_at'],
    ['users', 'banned_at'],
    ['users', 'locked_until'],
    ['auctions', 'start_at'],
    ['auctions', 'end_at'],
    ['auctions', 'created_at'],
    ['auctions', 'updated_at'],
    ['payments', 'grace_expires_at'],
    ['payments', 'created_at'],
    ['payments', 'updated_at'],
    ['payments', 'second_chance_expires_at'],
    ['payments', 'transferred_at'],
    ['financial_audit_logs', 'created_at']
  ];

  for (const [table, column] of columns) {
    pgm.alterColumn(table, column, { type: 'timestamptz' });
  }
};

export const down = (pgm) => {
  const columns = [
    ['refresh_tokens', 'expires_at'],
    ['refresh_tokens', 'created_at'],
    ['refresh_tokens', 'revoked_at'],
    ['email_verification_tokens', 'expires_at'],
    ['email_verification_tokens', 'created_at'],
    ['email_verification_tokens', 'used_at'],
    ['password_reset_tokens', 'expires_at'],
    ['password_reset_tokens', 'created_at'],
    ['password_reset_tokens', 'used_at'],
    ['categories', 'created_at'],
    ['bids', 'created_at'],
    ['webhook_events', 'processed_at'],
    ['webhook_events', 'created_at'],
    ['webhook_events', 'updated_at'],
    ['payment_methods', 'expires_at'],
    ['payment_methods', 'created_at'],
    ['platform_settings', 'updated_at'],
    ['users', 'created_at'],
    ['users', 'banned_at'],
    ['users', 'locked_until'],
    ['auctions', 'start_at'],
    ['auctions', 'end_at'],
    ['auctions', 'created_at'],
    ['auctions', 'updated_at'],
    ['payments', 'grace_expires_at'],
    ['payments', 'created_at'],
    ['payments', 'updated_at'],
    ['payments', 'second_chance_expires_at'],
    ['payments', 'transferred_at'],
    ['financial_audit_logs', 'created_at']
  ];

  for (const [table, column] of columns) {
    pgm.alterColumn(table, column, { type: 'timestamp' });
  }
};
