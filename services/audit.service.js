const AuditLog = require('../models/AuditLog');

/**
 * AuditService — centralizes AuditLog writes for privileged actions
 * (business verification/suspension, role/status changes, deletions).
 * Previously AuditLog was never created anywhere, leaving the admin
 * audit log page permanently empty (Audit C8).
 *
 * Logging failures are swallowed (logged, not thrown) — auditing must
 * never block or fail the primary admin operation.
 */
class AuditService {
  /**
   * @param {object} req - Express request (used for actor + ip/userAgent/requestId)
   * @param {object} params
   * @param {string} params.action - short action key, e.g. 'business.verify'
   * @param {string} params.resource - resource type, e.g. 'Business'
   * @param {string} [params.resourceId]
   * @param {object} [params.before]
   * @param {object} [params.after]
   * @param {'info'|'warning'|'critical'} [params.severity]
   */
  static async log(req, params) {
    try {
      await AuditLog.create({
        actor: req.user ? req.user._id : null,
        actorSnapshot: req.user
          ? { name: req.user.name, email: req.user.email, role: req.user.role }
          : undefined,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        changes: {
          before: params.before,
          after: params.after,
        },
        meta: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
        },
        severity: params.severity || 'info',
      });
    } catch (err) {
      console.error('[AuditService] Failed to log action:', params.action, err.message);
    }
  }
}

module.exports = AuditService;
