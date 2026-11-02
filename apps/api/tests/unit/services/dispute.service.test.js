import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as disputeService from '../../../src/services/dispute.service.js';
import { pool } from '../../../src/config/database.js';
import stripe from '../../../src/config/stripe.js';
import { emitToUser, emitToAdmin } from '../../../src/services/socket.service.js';
import { EventNames, DisputeStatus, PaymentStatus } from '@auction/shared-constants';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../../../src/config/stripe.js', () => ({
  default: {
    paymentIntents: {
      capture: vi.fn(),
      cancel: vi.fn(),
    },
    refunds: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../../src/services/socket.service.js', () => ({
  emitToUser: vi.fn(),
  emitToAdmin: vi.fn(),
}));

vi.mock('../../../src/jobs/queue.js', () => ({
  schedulePayoutJob: vi.fn().mockResolvedValue(),
  removeDeliveryJobs: vi.fn().mockResolvedValue(),
  rescheduleDeliveryJobs: vi.fn().mockResolvedValue(),
}));

describe('dispute.service', () => {
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);
  });

  describe('getDisputeById', () => {
    it('should return dispute details with escalation flags (isHighValue, isFrequentDisputer)', async () => {
      const pastSixMonths = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      pool.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'disp-1',
              auction_id: 'auc-1',
              auction_title: 'Rare Rolex',
              payment_id: 'pay-1',
              opened_by: 'buyer-1',
              opened_by_name: 'Alice',
              buyer_id: 'buyer-1',
              seller_id: 'seller-1',
              amount: 65000, // $650 -> high value (> $500)
              reason: 'ITEM_NOT_AS_DESCRIBED',
              description: 'Scratched bezel',
              evidence_urls: ['https://cdn.example.com/e1.jpg'],
              status: DisputeStatus.OPEN,
              resolution_note: null,
              policy_rule: null,
              deadline_at: '2026-03-10T00:00:00Z',
              seller_evidence_deadline_at: '2026-03-04T00:00:00Z',
              created_at: pastSixMonths,
              resolved_at: null,
              resolved_by: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          // User has opened 4 disputes in last 6 months -> frequent disputer
          rows: [{ count: 4 }],
        });

      const result = await disputeService.getDisputeById({
        disputeId: 'disp-1',
        userId: 'buyer-1',
        userRole: 'user',
      });

      expect(result.id).toBe('disp-1');
      expect(result.amount).toBe(65000);
      expect(result.isHighValue).toBe(true);
      expect(result.isFrequentDisputer).toBe(true);
      expect(result.userDisputeCount).toBe(4);
      expect(result.sellerEvidenceDeadlineAt).toBe('2026-03-04T00:00:00Z');
    });

    it('should reject access with 403 if user is neither buyer, seller, nor admin', async () => {
      pool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'disp-1',
            buyer_id: 'buyer-1',
            seller_id: 'seller-1',
          },
        ],
      });

      await expect(
        disputeService.getDisputeById({
          disputeId: 'disp-1',
          userId: 'stranger-user',
          userRole: 'user',
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Unauthorized',
      });
    });

    it('should throw 404 when dispute is not found', async () => {
      pool.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      await expect(
        disputeService.getDisputeById({
          disputeId: 'disp-missing',
          userId: 'admin-1',
          userRole: 'admin',
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Dispute not found',
      });
    });
  });

  describe('addEvidence', () => {
    it('should allow seller to add evidence within the 72h window', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'disp-1',
              status: DisputeStatus.OPEN,
              evidence_urls: ['https://cdn.example.com/e1.jpg'],
              seller_evidence_deadline_at: futureDeadline,
              buyer_id: 'buyer-1',
              seller_id: 'seller-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ evidence_urls: ['https://cdn.example.com/e1.jpg', 'https://cdn.example.com/seller1.jpg'] }],
        }) // UPDATE
        .mockResolvedValueOnce({}) // audit log
        .mockResolvedValueOnce({}); // COMMIT

      const result = await disputeService.addEvidence({
        disputeId: 'disp-1',
        userId: 'seller-1',
        evidenceUrls: ['https://cdn.example.com/seller1.jpg'],
      });

      expect(result.evidenceUrls).toHaveLength(2);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject seller evidence submission if the 72h deadline has expired', async () => {
      const pastDeadline = new Date(Date.now() - 3600000).toISOString(); // 1h ago
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'disp-1',
              status: DisputeStatus.OPEN,
              evidence_urls: ['https://cdn.example.com/e1.jpg'],
              seller_evidence_deadline_at: pastDeadline,
              buyer_id: 'buyer-1',
              seller_id: 'seller-1',
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        disputeService.addEvidence({
          disputeId: 'disp-1',
          userId: 'seller-1',
          evidenceUrls: ['https://cdn.example.com/late.jpg'],
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        errorCode: 'EVIDENCE_DEADLINE_EXPIRED',
        message: expect.stringContaining('72 hours window'),
      });

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject adding evidence to a resolved dispute', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'disp-1',
              status: DisputeStatus.RESOLVED_BUYER_WINS,
              evidence_urls: [],
              buyer_id: 'buyer-1',
              seller_id: 'seller-1',
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        disputeService.addEvidence({
          disputeId: 'disp-1',
          userId: 'buyer-1',
          evidenceUrls: ['https://cdn.example.com/new.jpg'],
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining('resolved or closed'),
      });
    });

    it('should reject if cumulative evidence files exceed max count (3)', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'disp-1',
              status: DisputeStatus.OPEN,
              evidence_urls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
              buyer_id: 'buyer-1',
              seller_id: 'seller-1',
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        disputeService.addEvidence({
          disputeId: 'disp-1',
          userId: 'buyer-1',
          evidenceUrls: ['https://cdn.example.com/3.jpg', 'https://cdn.example.com/4.jpg'], // total 4 > 3
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'TOO_MANY_EVIDENCE_FILES',
      });
    });
  });

  describe('reviewDispute', () => {
    it('should transition dispute from open to under_review', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'disp-1', status: DisputeStatus.OPEN, buyer_id: 'b-1', seller_id: 's-1' }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'disp-1', status: DisputeStatus.UNDER_REVIEW }],
        })
        .mockResolvedValueOnce({}) // audit log
        .mockResolvedValueOnce({}); // COMMIT

      const result = await disputeService.reviewDispute({
        disputeId: 'disp-1',
        adminId: 'admin-1',
      });

      expect(result.status).toBe(DisputeStatus.UNDER_REVIEW);
      expect(emitToUser).toHaveBeenCalledWith('b-1', EventNames.DISPUTE_REVIEWED, expect.objectContaining({ disputeId: 'disp-1', status: DisputeStatus.UNDER_REVIEW }));
      expect(emitToUser).toHaveBeenCalledWith('s-1', EventNames.DISPUTE_REVIEWED, expect.objectContaining({ disputeId: 'disp-1', status: DisputeStatus.UNDER_REVIEW }));
    });

    it('should prevent admin from reviewing dispute where they are buyer or seller', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'disp-1', status: DisputeStatus.OPEN, buyer_id: 'admin-self', seller_id: 's-1' }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        disputeService.reviewDispute({
          disputeId: 'disp-1',
          adminId: 'admin-self',
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'SELF_DISPUTE_FORBIDDEN',
      });
    });
  });

  describe('resolveDispute', () => {
    it('should reject resolving if admin is buyer or seller', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'disp-1',
              status: DisputeStatus.UNDER_REVIEW,
              p_id: 'pay-1',
              p_status: PaymentStatus.FROZEN,
              buyer_id: 'buyer-1',
              seller_id: 'admin-seller',
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        disputeService.resolveDispute({
          disputeId: 'disp-1',
          adminId: 'admin-seller',
          outcome: 'buyer_wins',
          resolutionNote: 'A detailed resolution note exceeding 20 chars',
          policyRule: 'ITEM_NOT_AS_DESCRIBED',
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'SELF_DISPUTE_FORBIDDEN',
      });
    });

    it('should reject resolving if dispute is not under_review', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'disp-1',
              status: DisputeStatus.OPEN,
              p_id: 'pay-1',
              p_status: PaymentStatus.FROZEN,
              buyer_id: 'b-1',
              seller_id: 's-1',
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        disputeService.resolveDispute({
          disputeId: 'disp-1',
          adminId: 'admin-1',
          outcome: 'buyer_wins',
          resolutionNote: 'Valid resolution note greater than 20 chars',
          policyRule: 'ITEM_NOT_AS_DESCRIBED',
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'INVALID_DISPUTE_STATE',
      });
    });
  });

  describe('getAdminDisputes', () => {
    it('should return paginated list of disputes with escalation flags', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'disp-1',
              auction_id: 'auc-1',
              auction_title: 'Gold Watch',
              payment_id: 'pay-1',
              opened_by: 'buyer-1',
              opened_by_name: 'Bob',
              amount: 120000, // $1200 -> isHighValue: true
              user_dispute_count: 5, // > 3 -> isFrequentDisputer: true
              reason: 'COUNTERFEIT_ITEM',
              description: 'Fake gold',
              evidence_urls: [],
              status: DisputeStatus.OPEN,
              deadline_at: '2026-03-10T00:00:00Z',
              seller_evidence_deadline_at: '2026-03-04T00:00:00Z',
              created_at: '2026-03-01T00:00:00Z',
            },
          ],
        });

      const result = await disputeService.getAdminDisputes({ page: 1, limit: 10 });

      expect(result.disputes).toHaveLength(1);
      const disp = result.disputes[0];
      expect(disp.isHighValue).toBe(true);
      expect(disp.isFrequentDisputer).toBe(true);
      expect(disp.userDisputeCount).toBe(5);
      expect(disp.sellerEvidenceDeadlineAt).toBe('2026-03-04T00:00:00Z');
      expect(result.meta.total).toBe(1);
    });
  });
});
