const User = require('../models/User');
const Business = require('../models/Business');
const AuditLog = require('../models/AuditLog');
const AuditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

const paginationParams = (req, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || defaultLimit, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

exports.getUsers = asyncHandler(async (req, res, next) => {
  const { page, limit, skip } = paginationParams(req);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;

  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, users, 'Users fetched', {
    page, limit, total, pages: Math.ceil(total / limit),
  }));
});

/**
 * Fixes Audit C8 (admin half) — privileged actions previously left no
 * trail at all; AuditLog was only ever read, never written.
 */
exports.updateUserStatus = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError('User not found', 404));

  const before = user.isActive;
  user.isActive = !user.isActive;
  await user.save();

  await AuditService.log(req, {
    action: 'user.status_change',
    resource: 'User',
    resourceId: user._id,
    before: { isActive: before },
    after: { isActive: user.isActive },
    severity: 'warning',
  });

  res.status(200).json(new ApiResponse(200, user, `User is now ${user.isActive ? 'active' : 'inactive'}`));
});

exports.getBusinesses = asyncHandler(async (req, res, next) => {
  const { page, limit, skip } = paginationParams(req);
  const filter = {};
  if (req.query.isVerified !== undefined) filter.isVerified = req.query.isVerified === 'true';
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const [businesses, total] = await Promise.all([
    Business.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Business.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, businesses, 'Businesses fetched', {
    page, limit, total, pages: Math.ceil(total / limit),
  }));
});

exports.verifyBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });
  if (!business) return next(new ApiError('Business not found', 404));

  await AuditService.log(req, {
    action: 'business.verify',
    resource: 'Business',
    resourceId: business._id,
    after: { isVerified: true },
    severity: 'info',
  });

  res.status(200).json(new ApiResponse(200, business, 'Business verified'));
});

exports.suspendBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!business) return next(new ApiError('Business not found', 404));

  await AuditService.log(req, {
    action: 'business.suspend',
    resource: 'Business',
    resourceId: business._id,
    after: { isActive: false },
    severity: 'critical',
  });

  res.status(200).json(new ApiResponse(200, business, 'Business suspended'));
});

exports.unsuspendBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
  if (!business) return next(new ApiError('Business not found', 404));
  res.status(200).json(new ApiResponse(200, business, 'Business unsuspended'));
});

exports.getAuditLogs = asyncHandler(async (req, res, next) => {
  const { page, limit, skip } = paginationParams(req, 50, 200);
  const filter = {};
  if (req.query.resource) filter.resource = req.query.resource;
  if (req.query.severity) filter.severity = req.query.severity;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort('-createdAt').skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, logs, 'Audit logs fetched', {
    page, limit, total, pages: Math.ceil(total / limit),
  }));
});
