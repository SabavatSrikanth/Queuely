const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const Business = require('../models/Business');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Loads the business and verifies the requester owns it (or is a
 * super_admin). Shared by all three analytics endpoints — previously only
 * getBusinessAnalytics had this check; getHeatmap/getForecast had none,
 * letting any business_owner view any other business's queue heatmap and
 * forecast data.
 */
const loadAuthorizedBusiness = async (req) => {
  const business = await Business.findById(req.params.id);
  if (!business) {
    throw new ApiError('Business not found', 404);
  }
  if (business.owner.toString() !== req.user.id && req.user.role !== 'super_admin') {
    throw new ApiError('Not authorized', 403);
  }
  return business;
};

exports.getBusinessAnalytics = asyncHandler(async (req, res, next) => {
  const range = req.query.range || '30d';
  const days = parseInt(range.replace('d', ''), 10) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const business = await loadAuthorizedBusiness(req);

  const events = await AnalyticsEvent.aggregate([
    { $match: { business: business._id, date: { $gte: startDate } } },
    { $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        avgWaitTime: { $avg: '$waitTime' },
        avgServeTime: { $avg: '$serveTime' },
      },
    },
  ]);

  // Derive a few headline metrics the dashboard cares about directly,
  // rather than making the frontend re-derive them from the raw groups.
  const totals = events.reduce((acc, e) => {
    acc[e._id] = e.count;
    return acc;
  }, {});
  const noShowRate = totals.join
    ? Math.round(((totals.no_show || 0) / totals.join) * 1000) / 10
    : 0;

  res.status(200).json(new ApiResponse(200, {
    byEventType: events,
    summary: {
      totalJoined: totals.join || 0,
      totalServed: totals.serve || 0,
      totalNoShows: totals.no_show || 0,
      totalCancelled: totals.cancel || 0,
      totalSkipped: totals.skip || 0,
      noShowRatePercent: noShowRate,
      appointmentsBooked: totals.appointment_book || 0,
      appointmentsCompleted: totals.appointment_complete || 0,
      appointmentsCancelled: totals.appointment_cancel || 0,
    },
  }, 'Analytics fetched'));
});

/**
 * Fixes Audit M5 — `business` is a string from req.params.id. Aggregation
 * pipelines (unlike find()) do not auto-cast strings to ObjectId, so
 * matching against the stored ObjectId field always failed silently,
 * returning an empty array regardless of how much data existed. Casting
 * explicitly with mongoose.Types.ObjectId fixes the match. Authorization
 * (previously missing entirely on this endpoint) is also added.
 */
exports.getHeatmap = asyncHandler(async (req, res, next) => {
  const business = await loadAuthorizedBusiness(req);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const heatmap = await AnalyticsEvent.aggregate([
    { $match: { business: new mongoose.Types.ObjectId(business._id), eventType: 'join', date: { $gte: startDate } } },
    { $group: { _id: { day: '$dayOfWeek', hour: '$hour' }, count: { $sum: 1 } } },
    { $sort: { '_id.day': 1, '_id.hour': 1 } },
  ]);

  res.status(200).json(new ApiResponse(200, heatmap, 'Heatmap fetched'));
});

/**
 * Fixes Audit M5 — same ObjectId-cast bug as getHeatmap, plus the
 * previous `avgCount: { $avg: 1 }` was a logic no-op (averaging the
 * constant 1 always yields exactly 1, regardless of actual data). This
 * is replaced with a real two-stage aggregation: first count joins per
 * calendar day, then average those daily counts grouped by day-of-week,
 * which is an actual same-day-of-week forecast.
 */
exports.getForecast = asyncHandler(async (req, res, next) => {
  const business = await loadAuthorizedBusiness(req);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const forecast = await AnalyticsEvent.aggregate([
    { $match: { business: new mongoose.Types.ObjectId(business._id), eventType: 'join', date: { $gte: ninetyDaysAgo } } },
    {
      $group: {
        _id: { dayOfWeek: '$dayOfWeek', calendarDate: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } },
        countThatDay: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.dayOfWeek',
        avgCount: { $avg: '$countThatDay' },
        daysObserved: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json(new ApiResponse(200, forecast.map((f) => ({
    dayOfWeek: f._id,
    predictedJoins: Math.round(f.avgCount),
    daysObserved: f.daysObserved,
  })), 'Forecast fetched'));
});
