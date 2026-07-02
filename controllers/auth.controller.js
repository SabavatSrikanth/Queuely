const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const NotificationService = require('../services/notification.service');
const emailTemplates = require('../utils/emailTemplates');
const { sendEmail } = require('../config/email');

const SELF_REGISTERABLE_ROLES = ['customer', 'business_owner'];

const parseDurationToMs = (input, fallbackMs) => {
  if (typeof input === 'number') return input * 1000;
  if (typeof input !== 'string') return fallbackMs;
  const match = /^(\d+)\s*(ms|s|m|h|d|y)?$/.exec(input.trim());
  if (!match) return fallbackMs;
  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';
  const unitMs = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, y: 31536000000 };
  return value * (unitMs[unit] || 1000);
};

const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();
  const refreshToken = user.getSignedRefreshToken();

  const accessMaxAge = parseDurationToMs(process.env.JWT_EXPIRES_IN, 15 * 60 * 1000);
  const refreshMaxAge = parseDurationToMs(process.env.JWT_REFRESH_EXPIRES_IN, 30 * 24 * 60 * 60 * 1000);

  const baseOptions = { httpOnly: true, sameSite: 'lax' };
  if (process.env.NODE_ENV === 'production') baseOptions.secure = true;

  res
    .status(statusCode)
    .cookie('token', token, { ...baseOptions, expires: new Date(Date.now() + accessMaxAge) })
    .cookie('refreshToken', refreshToken, { ...baseOptions, expires: new Date(Date.now() + refreshMaxAge) })
    .json(new ApiResponse(statusCode, {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        branchId: user.branchId,
      },
    }, 'Success'));
};

exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone, role } = req.body;

  const requestedRole = SELF_REGISTERABLE_ROLES.includes(role) ? role : 'customer';

  const existing = await User.findOne({ email });
  if (existing) {
    return next(new ApiError('An account with this email already exists', 409));
  }

  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: requestedRole,
    isEmailVerified: true,
  });

  user.lastLoginAt = Date.now();
  await user.save({ validateBeforeSave: false });

  // Best-effort welcome email — never blocks registration if it fails
  sendEmail({
    to: user.email,
    subject: `Welcome to ${process.env.APP_NAME || 'Queuely'}!`,
    html: `<p>Hi ${user.name},</p><p>Your account has been created successfully. You can now join queues and book appointments.</p>`,
  }).catch((err) => console.error('[Auth] Welcome email failed (non-blocking):', err.message));

  sendTokenResponse(user, 201, res);
});

exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return next(new ApiError('Please provide an email and password', 400));

  const user = await User.findOne({ email }).select('+password');
  if (!user) return next(new ApiError('Invalid credentials', 401));
  if (!user.isActive) return next(new ApiError('This account has been deactivated. Contact support for help.', 401));
  if (!user.isEmailVerified) return next(new ApiError('Please verify your email before logging in. Check your inbox for the OTP.', 403));

  const isMatch = await user.matchPassword(password);
  if (!isMatch) return next(new ApiError('Invalid credentials', 401));

  user.lastLoginAt = Date.now();
  await user.save({ validateBeforeSave: false });
  sendTokenResponse(user, 200, res);
});

exports.logout = asyncHandler(async (req, res, next) => {
  const expired = { expires: new Date(Date.now() + 10 * 1000), httpOnly: true };
  res.cookie('token', 'none', expired);
  res.cookie('refreshToken', 'none', expired);
  res.status(200).json(new ApiResponse(200, {}, 'User logged out successfully'));
});

exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'));
});

exports.updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');
  if (!req.body.newPassword || req.body.newPassword.length < 8) return next(new ApiError('New password must be at least 8 characters', 400));
  if (!(await user.matchPassword(req.body.currentPassword))) return next(new ApiError('Password is incorrect', 401));
  user.password = req.body.newPassword;
  await user.save();
  sendTokenResponse(user, 200, res);
});

exports.refreshToken = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies.refreshToken;
  if (!token || token === 'none') return next(new ApiError('No refresh token provided', 401));

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  } catch (err) {
    return next(new ApiError('Invalid or expired refresh token', 401));
  }

  if (decoded.type !== 'refresh') return next(new ApiError('Invalid refresh token', 401));
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) return next(new ApiError('User no longer exists or is deactivated', 401));
  sendTokenResponse(user, 200, res);
});

exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new ApiError('Please provide an email address', 400));

  const genericResponse = new ApiResponse(200, {}, 'If an account with that email exists, a password reset link has been sent.');
  const user = await User.findOne({ email });
  if (!user) return res.status(200).json(genericResponse);

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
  try {
    const content = emailTemplates.passwordReset({ name: user.name, resetUrl });
    await sendEmail({ to: user.email, subject: content.subject, html: content.html, text: content.text });
  } catch (err) {
    console.error('[Auth] Failed to send password reset email:', err.message);
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ApiError('Could not send password reset email. Please try again later.', 500));
  }

  res.status(200).json(genericResponse);
});

exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  if (!password || password.length < 8) return next(new ApiError('Password must be at least 8 characters', 400));

  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({ passwordResetToken: hashedToken, passwordResetExpiry: { $gt: Date.now() } });
  if (!user) return next(new ApiError('Password reset token is invalid or has expired', 400));

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  await user.save();

  await NotificationService.send({
    recipient: user._id,
    type: 'system_alert',
    title: 'Your password was changed',
    body: 'Your Queuely password was just reset. If this wasn\u2019t you, contact support immediately.',
    channels: ['email'],
  });

  sendTokenResponse(user, 200, res);
}); // <-- THIS bracket was missing, which trapped acceptStaffInvite inside!

exports.acceptStaffInvite = asyncHandler(async (req, res, next) => {
  const { token, email, name, password } = req.body;
  if (!token || !email || !name || !password) {
    return next(new ApiError('All fields are required', 400));
  }
  if (password.length < 8) {
    return next(new ApiError('Password must be at least 8 characters', 400));
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    email,
    emailVerifyToken: hashedToken,
    emailVerifyExpiry: { $gt: Date.now() },
    role: 'staff',
    isActive: false,
  });

  if (!user) return next(new ApiError('Invalid or expired invitation link', 400));

  user.name = name;
  user.password = password;
  user.isEmailVerified = true;
  user.isActive = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpiry = undefined;
  user.lastLoginAt = Date.now();
  await user.save();

  sendTokenResponse(user, 200, res);
});