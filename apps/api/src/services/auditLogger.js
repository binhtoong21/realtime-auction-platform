import { pool } from '../config/database.js';

/**
 * Writes an audit log entry for financial transactions and status changes.
 * 
 * @param {Object} params
 * @param {string} params.referenceId - The ID of the affected record (e.g. payment_id, dispute_id)
 * @param {string} params.referenceType - The type of record ('payment', 'dispute', 'auction', etc.)
 * @param {string} params.action - The action being performed (e.g. 'shipping_overdue_refund')
 * @param {string|null} params.ipAddress - The IP address of the actor, or null
 * @param {boolean} [params.strict=false] - If true, throws errors to fail the caller transaction if audit write fails
 */
export async function writeAuditLog({ referenceId, referenceType, action, deltaState, actorId = null, ipAddress = null, strict = false }) {
  try {
    // ALWAYS use pool.query instead of a passed transaction client.
    // This makes the audit write an autonomous transaction.
    // TRADE-OFF: This causes eventual consistency and potential orphaned audit rows 
    // if the app crashes before the main transaction commits.
    // 
    // For the special-case table `financial_audit_logs`, this is generally acceptable 
    // to ensure we log attempts even if the main transaction rolls back.
    // However, callers who strictly need atomicity with their main transaction 
    // MUST use an alternative atomic pathway (e.g. passing a dbClient if we modify this signature later, 
    // or using the outbox pattern).
    //
    // TODO: Verify downstream consumers handle eventual consistency.
    // TODO: Add tests or monitoring for orphaned audit rows.
    await pool.query(
      `INSERT INTO financial_audit_logs 
        (reference_id, reference_type, action, delta_state, actor_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [referenceId, referenceType, action, JSON.stringify(deltaState), actorId, ipAddress]
    );
  } catch (err) {
    // 42P01: undefined_table (in case the migration hasn't run yet)
    if (err.code === '42P01') {
      console.warn(`[AuditLogger] Table financial_audit_logs does not exist yet. Skipping audit log for ${action}.`);
    } else {
      console.error(`[AuditLogger] Failed to write audit log for ${action}:`, err.message);
    }

    if (strict) {
      throw err;
    }
    // If strict=false, we don't throw here to avoid failing the main transaction just because of audit log failure
  }
}
