const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const errorMiddleware = require('./middleware/error.middleware');
const requestIdMiddleware = require('./middleware/requestId.middleware');
const { attachUser, requirePageAuth } = require('./middleware/auth.middleware');
const { escapeHtml, escapeJsString } = require('./utils/sanitizeForView');

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const businessRoutes = require('./routes/business.routes');
const branchRoutes = require('./routes/branch.routes');
const serviceRoutes = require('./routes/service.routes');
const queueRoutes = require('./routes/queue.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const reviewRoutes = require('./routes/review.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const APP_NAME = process.env.APP_NAME || 'Queuely';

// ─── Trust Proxy (for rate limiting behind Render/Nginx) ─────────────────────
app.set('trust proxy', 1);

// ─── View Engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Security Middleware ───────────────────────────────────────────────────────
// Fixes Audit H1: the UI loads Bootstrap CSS/icons + their @font-face assets
// from cdn.jsdelivr.net, but that origin was missing from styleSrc/fontSrc,
// so the CSP silently blocked all of the app's own styling in every browser
// that enforces CSP. cdn.jsdelivr.net is now allowed for both.
app.use(helmet({
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.socket.io', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
    imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://ui-avatars.com'],
    connectSrc: ["'self'", 'wss:', 'ws:', 'https://cdn.jsdelivr.net', 'https://cdn.socket.io'],
  },
},
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many authentication attempts, please try again in 15 minutes.' },
});

const queueJoinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many queue join attempts from this IP.' },
});

app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/queue/join/', queueJoinLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Sanitization ─────────────────────────────────────────────────────────────
app.use(mongoSanitize());

// ─── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ─── Request ID ───────────────────────────────────────────────────────────────
app.use(requestIdMiddleware);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/businesses', businessRoutes);

// Fixes Audit C6: branch/service routers use mergeParams and read
// req.params.businessId / req.params.branchId, but were previously only
// mounted flat (so those params were always undefined, breaking branch and
// service creation/listing entirely). They are now mounted BOTH nested
// (so collection routes work as designed) AND flat (so existing
// :id-based direct routes — get/update/delete/toggle — keep working
// exactly as before, and so the frontend's `?business=`/`?branch=` query
// filters on the flat routes still work for callers that don't nest).
app.use('/api/businesses/:businessId/branches', branchRoutes);
app.use('/api/branches/:branchId/services', serviceRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);

app.use('/api/queue', queueRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// ─── Page Routes (SSR) ────────────────────────────────────────────────────────
// attachUser performs soft auth for every page route below: it never blocks
// the request, but populates res.locals.user whenever a valid session
// exists, so the shared layout's navbar can finally reflect real login
// state (fixes Audit H3 — previously no res.render() call ever passed a
// `user` variable, so the navbar always rendered as logged-out).
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  res.redirect('/login');
});

app.use(attachUser);

// Public queue page — no auth required
app.get('/q/:businessSlug/:serviceId', async (req, res, next) => {
  try {
    if (!res.locals.user) {
      return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    }
    res.render('public/live-queue', {
      businessSlug: escapeJsString(req.params.businessSlug),
      serviceId: escapeJsString(req.params.serviceId),
      user: res.locals.user,
      appName: APP_NAME,
    });
  } catch (err) { next(err); }
});

// Public ticket status page
app.get('/ticket-status/:ticketId', async (req, res, next) => {
  try {
    res.render('public/ticket-status', {
      ticketId: escapeJsString(req.params.ticketId),
      user: res.locals.user,
      appName: APP_NAME,
    });
  } catch (err) { next(err); }
});
// Back-compat alias for the older /ticket/:id path
app.get('/ticket/:ticketId', (req, res) => res.redirect(301, `/ticket-status/${encodeURIComponent(req.params.ticketId)}`));
app.get('/notifications', requirePageAuth('customer'), (req, res) => res.render('customer/notifications', { appName: APP_NAME, user: res.locals.user }));
// Auth pages — redirect already-logged-in users away from these
app.get('/login', (req, res) => {
  if (res.locals.user) return res.redirect('/dashboard');
  res.render('auth/login', { appName: APP_NAME, error: null, redirect: req.query.redirect ? escapeJsString(req.query.redirect) : null, user: null });
});
app.get('/register', (req, res) => {
  if (res.locals.user) return res.redirect('/dashboard');
  res.render('auth/register', { appName: APP_NAME, error: null, user: null });
});
app.get('/verify-otp', (req, res) => res.render('auth/verify-otp', { appName: APP_NAME, user: null }));
app.get('/forgot-password', (req, res) => res.render('auth/forgot-password', { appName: APP_NAME, error: null, success: null, user: res.locals.user }));
app.get('/reset-password/:token', (req, res) => res.render('auth/reset-password', { token: escapeHtml(req.params.token), appName: APP_NAME, error: null, user: res.locals.user }));

// Customer pages
app.get('/', (req, res) => {
  if (res.locals.user && res.locals.user.role === 'super_admin') {
    return res.redirect('/admin');
  }
  if (res.locals.user && ['business_owner', 'branch_manager', 'staff'].includes(res.locals.user.role)) {
    return res.redirect('/dashboard');
  }
  res.render('customer/home', { appName: APP_NAME, user: res.locals.user });
});
app.get('/businesses/:slug', (req, res) => res.render('customer/business-detail', { slug: escapeJsString(req.params.slug), appName: APP_NAME, user: res.locals.user }));
app.get('/my-tickets', requirePageAuth(), (req, res) => res.render('customer/my-tickets', { appName: APP_NAME, user: res.locals.user }));
app.get('/my-appointments', requirePageAuth(), (req, res) => res.render('customer/my-appointments', { appName: APP_NAME, user: res.locals.user, bookServiceId: req.query.book ? escapeJsString(req.query.book) : null }));

// Business dashboard pages — require a logged-in staff/owner/manager role.
// Fixes Audit H3: these pages previously had no auth guard at all, so the
// dashboard HTML shell (and the data it implies) was reachable by anyone.
const businessRoles = ['business_owner', 'branch_manager', 'staff', 'super_admin'];
app.get('/dashboard', requirePageAuth(...businessRoles), (req, res) => res.render('business/dashboard', { appName: APP_NAME, user: res.locals.user }));
app.get('/dashboard/queue-manager', requirePageAuth(...businessRoles), (req, res) => res.render('business/queue-manager', { appName: APP_NAME, user: res.locals.user }));
app.get('/dashboard/branches', requirePageAuth('business_owner', 'super_admin'), (req, res) => res.render('business/branches', { appName: APP_NAME, user: res.locals.user }));
app.get('/dashboard/appointments', requirePageAuth(...businessRoles), (req, res) => res.render('business/appointments', { appName: APP_NAME, user: res.locals.user }));
app.get('/dashboard/analytics', requirePageAuth('business_owner', 'branch_manager', 'super_admin'), (req, res) => res.render('business/analytics', { appName: APP_NAME, user: res.locals.user }));
app.get('/dashboard/settings', requirePageAuth('business_owner', 'super_admin'), (req, res) => res.render('business/settings', { appName: APP_NAME, user: res.locals.user }));

// Admin pages — super_admin only
app.get('/admin', requirePageAuth('super_admin'), (req, res) => res.render('admin/dashboard', { appName: APP_NAME, user: res.locals.user }));
app.get('/admin/audit-log', requirePageAuth('super_admin'), (req, res) => res.render('admin/audit-log', { appName: APP_NAME, user: res.locals.user }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Queuely API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
  }
  res.status(404).render('errors/error', {
    title: 'Page Not Found',
    appName: APP_NAME,
    statusCode: 404,
    message: `The page ${escapeHtml(req.path)} doesn't exist.`,
    user: res.locals.user || null,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorMiddleware);

module.exports = app;
