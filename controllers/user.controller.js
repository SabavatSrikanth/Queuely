const User = require('../models/User');
const AuditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

// Fields a user may change about their own profile. Anything else
// (role, isActive, businessId, branchId, isEmailVerified, etc.) must go
// through a dedicated, properly-authorized admin endpoint instead.
// Fixes Audit C3 — updateUser previously passed the raw req.body straight
// into findByIdAndUpdate, so a customer could PUT their own profile with
// { "role": "super_admin" } and instantly grant themselves admin rights.
const SELF_UPDATABLE_FIELDS = ['name', 'phone', 'avatar', 'notificationPreferences'];

// Additional fields a super_admin may change on any user, beyond the
// self-updatable set above.
const ADMIN_UPDATABLE_FIELDS = ['role', 'isActive', 'businessId', 'branchId', 'isEmailVerified', 'name', 'phone', 'avatar'];

const pickFields = (source, allowedFields) => {
  const result = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }
  return result;
};

exports.getUsers = asyncHandler(async (req, res, next) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.businessId) filter.businessId = req.query.businessId;

  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, users, 'Users fetched', {
    page, limit, total, pages: Math.ceil(total / limit),
  }));
});

/**
 * Fixes Audit C5 — previously any authenticated user could fetch any other
 * user's full profile by ID (an IDOR/PII leak). Now restricted to the user
 * themselves, staff/owner/manager of the same business (so a business can
 * look up its own staff members), or a super_admin.
 */
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  const isSelf = req.user.id === req.params.id;
  const isSuperAdmin = req.user.role === 'super_admin';
  const isSameBusinessStaff =
    ['business_owner', 'branch_manager'].includes(req.user.role) &&
    req.user.businessId &&
    user.businessId &&
    String(req.user.businessId) === String(user.businessId);

  if (!isSelf && !isSuperAdmin && !isSameBusinessStaff) {
    return next(new ApiError('Not authorized to view this user', 403));
  }

  res.status(200).json(new ApiResponse(200, user, 'User fetched'));
});

exports.updateUser = asyncHandler(async (req, res, next) => {
  const isSelf = req.user.id === req.params.id;
  const isSuperAdmin = req.user.role === 'super_admin';

  if (!isSelf && !isSuperAdmin) {
    return next(new ApiError('Not authorized to update this user', 403));
  }

  const allowedFields = isSuperAdmin && !isSelf ? ADMIN_UPDATABLE_FIELDS : SELF_UPDATABLE_FIELDS;
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    return next(new ApiError('No valid fields provided to update', 400));
  }

  const before = await User.findById(req.params.id);
  if (!before) {
    return next(new ApiError('User not found', 404));
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (isSuperAdmin && !isSelf && (updates.role || updates.isActive !== undefined)) {
    await AuditService.log(req, {
      action: 'user.update',
      resource: 'User',
      resourceId: user._id,
      before: { role: before.role, isActive: before.isActive },
      after: { role: user.role, isActive: user.isActive },
      severity: 'warning',
    });
  }

  res.status(200).json(new ApiResponse(200, user, 'User updated'));
});

exports.deleteUser = asyncHandler(async (req, res, next) => {
  if (req.user.id !== req.params.id && req.user.role !== 'super_admin') {
    return next(new ApiError('Not authorized to delete this user', 403));
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new ApiError('User not found', 404));
  }
  await user.deleteOne();

  if (req.user.role === 'super_admin' && req.user.id !== req.params.id) {
    await AuditService.log(req, {
      action: 'user.delete',
      resource: 'User',
      resourceId: req.params.id,
      before: { name: user.name, email: user.email, role: user.role },
      severity: 'critical',
    });
  }

  res.status(200).json(new ApiResponse(200, {}, 'User deleted'));
});
