const crypto = require('crypto');
const User = require('../models/User');
const AuditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const emailTemplates = require('../utils/emailTemplates');
const { sendEmail } = require('../config/email');

const SELF_UPDATABLE_FIELDS = ['name', 'phone', 'avatar', 'notificationPreferences'];
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

exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError('User not found', 404));
  const isSelf = req.user.id === req.params.id;
  const isSuperAdmin = req.user.role === 'super_admin';
  const isSameBusinessStaff =
    ['business_owner', 'branch_manager'].includes(req.user.role) &&
    req.user.businessId && user.businessId &&
    String(req.user.businessId) === String(user.businessId);
  if (!isSelf && !isSuperAdmin && !isSameBusinessStaff) {
    return next(new ApiError('Not authorized to view this user', 403));
  }
  res.status(200).json(new ApiResponse(200, user, 'User fetched'));
});

exports.updateUser = asyncHandler(async (req, res, next) => {
  const isSelf = req.user.id === req.params.id;
  const isSuperAdmin = req.user.role === 'super_admin';
  if (!isSelf && !isSuperAdmin) return next(new ApiError('Not authorized to update this user', 403));
  const allowedFields = isSuperAdmin && !isSelf ? ADMIN_UPDATABLE_FIELDS : SELF_UPDATABLE_FIELDS;
  const updates = pickFields(req.body, allowedFields);
  if (Object.keys(updates).length === 0) return next(new ApiError('No valid fields provided to update', 400));
  const before = await User.findById(req.params.id);
  if (!before) return next(new ApiError('User not found', 404));
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (isSuperAdmin && !isSelf && (updates.role || updates.isActive !== undefined)) {
    await AuditService.log(req, {
      action: 'user.update', resource: 'User', resourceId: user._id,
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
  if (!user) return next(new ApiError('User not found', 404));
  await user.deleteOne();
  if (req.user.role === 'super_admin' && req.user.id !== req.params.id) {
    await AuditService.log(req, {
      action: 'user.delete', resource: 'User', resourceId: req.params.id,
      before: { name: user.name, email: user.email, role: user.role },
      severity: 'critical',
    });
  }
  res.status(200).json(new ApiResponse(200, {}, 'User deleted'));
});

exports.inviteStaff = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new ApiError('Email is required', 400));

  if (!req.user.businessId) return next(new ApiError('You must have a business to invite staff', 400));

  const existing = await User.findOne({ email });
  if (existing) {
    if (String(existing.businessId) === String(req.user.businessId)) {
      return next(new ApiError('This person is already part of your business', 409));
    }
    return next(new ApiError('An account with this email already exists', 409));
  }

  const inviteToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(inviteToken).digest('hex');

  const placeholder = await User.create({
    name: 'Pending Staff',
    email,
    password: crypto.randomBytes(16).toString('hex'),
    role: 'staff',
    businessId: req.user.businessId,
    isEmailVerified: false,
    isActive: false,
    emailVerifyToken: hashedToken,
    emailVerifyExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  const acceptUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/accept-invite?token=${inviteToken}&email=${encodeURIComponent(email)}`;

  try {
    const Business = require('../models/Business');
    const business = await Business.findById(req.user.businessId);
    const content = emailTemplates.staffInvite({
      inviterName: req.user.name,
      businessName: business ? business.name : 'your business',
      acceptUrl,
    });
    await sendEmail({ to: email, subject: content.subject, html: content.html });
  } catch (err) {
    console.error('[Staff Invite] Email failed:', err.message);
  }

  res.status(201).json(new ApiResponse(201, { email }, 'Invitation sent successfully'));
});

exports.getStaff = asyncHandler(async (req, res, next) => {
  if (!req.user.businessId) return next(new ApiError('No business found', 400));
  const staff = await User.find({
    businessId: req.user.businessId,
    role: { $in: ['staff', 'branch_manager'] },
  }).select('name email role isActive isEmailVerified createdAt');
  res.status(200).json(new ApiResponse(200, staff, 'Staff fetched'));
});

exports.removeStaff = asyncHandler(async (req, res, next) => {
  const staff = await User.findById(req.params.id);
  if (!staff) return next(new ApiError('Staff member not found', 404));
  if (String(staff.businessId) !== String(req.user.businessId)) {
    return next(new ApiError('Not authorized to remove this staff member', 403));
  }
  await staff.deleteOne();
  res.status(200).json(new ApiResponse(200, {}, 'Staff member removed'));
});