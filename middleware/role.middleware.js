const ApiError = require('../utils/ApiError');

/**
 * authorize(...roles) — single source of truth for role-based authorization.
 * Must run after `protect` (so req.user is populated). Defensively
 * handles a missing req.user instead of throwing a raw TypeError.
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Not authorized to access this route', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(`User role ${req.user.role} is not authorized to access this route`, 403));
    }
    next();
  };
};
