const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { authorize } = require('./role.middleware');

/**
 * Extracts and verifies the JWT from either the Authorization header
 * or the httpOnly cookie. Returns the decoded payload, or null if
 * no valid token is present. Never throws.
 */
const readToken = (req) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  return token || null;
};

/**
 * protect — hard API guard. Rejects the request with 401 if no valid,
 * active user is associated with the request's token.
 */
exports.protect = asyncHandler(async (req, res, next) => {
  const token = readToken(req);

  if (!token) {
    return next(new ApiError('Not authorized to access this route', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new ApiError('User belonging to token no longer exists', 401));
    }

    if (!user.isActive) {
      return next(new ApiError('User account is deactivated', 401));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError('Not authorized to access this route', 401));
  }
});

/**
 * attachUser — soft auth for server-rendered pages. Never blocks the
 * request. If a valid token/cookie is present, populates req.user and
 * res.locals.user so views can reflect logged-in state (navbar, etc.).
 * If the token is missing/invalid/expired, res.locals.user stays null
 * and the request proceeds as an anonymous visitor.
 */
exports.attachUser = asyncHandler(async (req, res, next) => {
  res.locals.user = null;

  const token = readToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (user && user.isActive) {
      req.user = user;
      res.locals.user = user;
    }
  } catch (error) {
    // Invalid/expired token on a page route — treat as anonymous, don't 401.
  }

  next();
});

/**
 * requirePageAuth(...roles) — hard guard for server-rendered pages.
 * Must run after attachUser. Redirects to /login (preserving the
 * originally requested URL) instead of returning a JSON 401, since
 * this protects HTML routes, not API routes. If roles are given, the
 * authenticated user's role must be included or a 403 page is shown.
 */
exports.requirePageAuth = (...roles) => (req, res, next) => {
  if (!res.locals.user) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }

  if (roles.length > 0 && !roles.includes(res.locals.user.role)) {
    return res.status(403).render('errors/403', {
      title: 'Access Denied',
      appName: process.env.APP_NAME || 'Queuely',
      user: res.locals.user,
    });
  }

  next();
};

// Re-exported for backward compatibility — every route file imports
// `authorize` from this module. The single source of truth now lives
// in role.middleware.js (fixes the previous duplicate implementation).
exports.authorize = authorize;
