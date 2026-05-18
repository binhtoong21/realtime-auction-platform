export const shorthands = undefined;

export const up = (pgm) => {
  // Add Second Chance metadata columns to payments table
  pgm.addColumns('payments', {
    second_chance_runner_up_id: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    second_chance_amount: {
      type: 'BIGINT',
    },
    second_chance_expires_at: {
      type: 'timestamp',
    },
  });

  // Partial index for active second chance offers
  pgm.sql(`
    CREATE INDEX idx_payments_second_chance
    ON payments (second_chance_runner_up_id)
    WHERE second_chance_runner_up_id IS NOT NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_payments_second_chance;');
  pgm.dropColumns('payments', [
    'second_chance_runner_up_id',
    'second_chance_amount',
    'second_chance_expires_at',
  ]);
};
