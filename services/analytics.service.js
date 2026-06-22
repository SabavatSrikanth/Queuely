const AnalyticsEvent = require('../models/AnalyticsEvent');

/**
 * AnalyticsService — centralizes AnalyticsEvent writes so every queue and
 * appointment lifecycle transition is consistently recorded. Previously
 * AnalyticsEvent was never created anywhere in the codebase, leaving the
 * entire analytics dashboard permanently empty (Audit C8).
 *
 * Logging failures are swallowed (logged, not thrown) — analytics must
 * never block or fail the primary queue/appointment operation.
 */
class AnalyticsService {
  /**
   * @param {object} params
   * @param {string} params.business - Business ObjectId
   * @param {string} params.branch - Branch ObjectId
   * @param {string} params.service - Service ObjectId
   * @param {string} params.eventType - one of AnalyticsEvent.eventType enum
   * @param {Date} [params.date] - defaults to now
   * @param {number} [params.waitTime] - minutes between join/book and call/serve
   * @param {number} [params.serveTime] - minutes spent being actively served
   * @param {boolean} [params.isGuest]
   * @param {string} [params.ticketType] - 'walk_in' | 'appointment'
   */
  static async log(params) {
    if (!params.business || !params.branch || !params.service || !params.eventType) {
      console.warn(
        '[AnalyticsService] Skipped logging event — missing required field(s):',
        params.eventType,
        { business: !!params.business, branch: !!params.branch, service: !!params.service }
      );
      return;
    }

    try {
      await AnalyticsEvent.create({
        business: params.business,
        branch: params.branch,
        service: params.service,
        eventType: params.eventType,
        date: params.date || new Date(),
        waitTime: params.waitTime,
        serveTime: params.serveTime,
        isGuest: params.isGuest,
        ticketType: params.ticketType,
      });
    } catch (err) {
      console.error('[AnalyticsService] Failed to log event:', params.eventType, err.message);
    }
  }
}

module.exports = AnalyticsService;
