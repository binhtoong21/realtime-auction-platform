import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processGracePeriodSweeper } from '../../../src/jobs/payment.worker.js';
import { pool } from '../../../src/config/database.js';

// We mock the DB and socket layers to isolate the logic
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../../../src/config/redis.js', () => ({
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  }
}));

vi.mock('../../../src/config/stripe.js', () => ({
  default: {
    paymentIntents: {
      capture: vi.fn(),
      retrieve: vi.fn(),
    }
  }
}));

vi.mock('../../../src/services/socket.service.js', () => ({
  emitToUser: vi.fn(),
  emitToAdmin: vi.fn(),
}));

vi.mock('../../../src/services/payout.service.js', () => ({
  createPayout: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: class {
    constructor() {}
    on = vi.fn()
    get = vi.fn()
    set = vi.fn()
    del = vi.fn()
  }
}));

vi.mock('bullmq', () => ({
  Worker: class {
    constructor() {}
    on = vi.fn()
    close = vi.fn()
  },
  Queue: class {
    constructor() {}
    add = vi.fn()
    on = vi.fn()
  },
}));

describe('processGracePeriodSweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process multiple stuck grace_period payments and isolate errors', async () => {
    // Mock the initial SELECT query to return 2 stuck payments
    const stuckPayments = [
      { id: 'payment-1', auction_id: 'auction-1' },
      { id: 'payment-2', auction_id: 'auction-2' },
    ];
    
    // Setup pool.query to handle the SELECT and subsequent queries
    pool.query.mockImplementation((queryText, params) => {
      if (queryText.includes("WHERE status = 'grace_period' AND grace_expires_at < NOW()")) {
        return Promise.resolve({ rows: stuckPayments });
      }
      
      // Inside processGracePeriodExpiry, it selects the payment first
      if (queryText.includes('SELECT id, status, buyer_id, amount FROM payments')) {
        const pId = params[0];
        return Promise.resolve({
          rows: [{ id: pId, status: 'grace_period', buyer_id: 'buyer-1', amount: 100 }]
        });
      }

      // Simulate a DB error when fetching runner-up for payment-1
      if (queryText.includes('SELECT bidder_id, amount FROM bids') && params[0] === 'auction-1') {
        return Promise.reject(new Error('Simulated DB Timeout on payment 1'));
      }

      // Return a runner-up for payment-2
      if (queryText.includes('SELECT bidder_id, amount FROM bids') && params[0] === 'auction-2') {
        return Promise.resolve({
          rows: [{ bidder_id: 'runner-up-2', amount: 90 }]
        });
      }

      // Mock successful lock updates
      if (queryText.includes('UPDATE payments') && queryText.includes('RETURNING id')) {
        return Promise.resolve({ rowCount: 1 });
      }

      return Promise.resolve({ rowCount: 1, rows: [] });
    });

    // Mock pool.connect for transactions
    const mockClient = {
      query: vi.fn().mockImplementation((queryText, params) => {
        // Mock successful lock updates inside transaction
        if (queryText.includes('UPDATE payments') && queryText.includes('RETURNING id')) {
          return Promise.resolve({ rowCount: 1 });
        }
        
        // Mock runner-up select inside transaction
        if (queryText.includes('SELECT bidder_id, amount FROM bids') && params && params[0] === 'auction-1') {
          return Promise.reject(new Error('Simulated DB Timeout on payment 1'));
        }
        if (queryText.includes('SELECT bidder_id, amount FROM bids') && params && params[0] === 'auction-2') {
          return Promise.resolve({
            rows: [{ bidder_id: 'runner-up-2', amount: 90 }]
          });
        }
        
        return Promise.resolve({ rowCount: 1, rows: [] });
      }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    await processGracePeriodSweeper();

    // Verify that the initial select was called
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE status = 'grace_period' AND grace_expires_at < NOW()"));

    // Verify that both payments were processed despite payment-1 throwing an error
    // payment-1 throws an error during the processGracePeriodExpiry logic.
    // However, payment-2 should successfully run and call UPDATE payments SET status = 'second_chance' ... 
    
    // We check if mockClient.query was called to update payment-2 to second_chance
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE payments\n         SET status = 'second_chance'"),
      expect.arrayContaining(['payment-2', 'runner-up-2', 90, expect.any(Date)])
    );

    // Verify that payment-1 rollback occurred
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    
    // Verify that payment-2 commit occurred
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('should exit early if no stuck payments are found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await processGracePeriodSweeper();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
