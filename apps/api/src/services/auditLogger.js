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
    // ALWAYS use pool.query instead of a passed transaction client (dbClient).
    // This makes the audit write an autonomous transaction.
    // Why? We want to record failed attempts or actions even if the main transaction rolls back.
    // However, for pure financial_audit_logs, we might want them to be atomic. If atomic is needed, 
    // the caller should pass dbClient (if we revert this) OR we rely on eventual consistency.
    // Currently, our design states audit logs must not be rolled back.
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
      if (strict) {
        throw err;
      }
      // If strict=false, we don't throw here to avoid failing the main transaction just because of audit log failure
    }
  }
}
