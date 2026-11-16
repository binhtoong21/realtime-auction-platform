/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE payment_attempts (
      id uuid PRIMARY KEY,
      payment_id uuid NOT NULL REFERENCES payments ON DELETE CASCADE,
      kind varchar(20) NOT NULL,
      buyer_id uuid NOT NULL REFERENCES users,
      amount bigint NOT NULL,
      platform_fee_amount bigint NOT NULL,
      payment_method_id uuid REFERENCES payment_methods ON DELETE SET NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      stripe_pi_id varchar(255),
      error text,
      locked_until timestamptz,
      stripe_requested_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX uq_payment_attempts_one_pending ON payment_attempts (payment_id) WHERE status = 'pending';
    CREATE INDEX idx_payment_attempts_status_updated_at ON payment_attempts (status, updated_at);
    CREATE TABLE orphan_refunds (
      stripe_pi_id varchar(255) PRIMARY KEY,
      attempt_id uuid REFERENCES payment_attempts ON DELETE SET NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      stripe_refund_id varchar(255),
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_orphan_refunds_status_updated_at ON orphan_refunds (status, updated_at);
  `);
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE orphan_refunds');
  pgm.sql('DROP TABLE payment_attempts');
};
