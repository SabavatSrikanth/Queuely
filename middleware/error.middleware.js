const ApiError = require('../utils/ApiError');
const { escapeHtml } = require('../utils/sanitizeForView');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console for dev
  if (process.env.NODE_ENV !== 'production') {
    console.log(err.stack);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id of ${err.value}`;
    error = new ApiError(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    const message = `Duplicate value for '${field}' — it must be unique`;
    error = new ApiError(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ApiError(message, 400);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Server Error';

  // API routes (and any client explicitly expecting JSON) get a JSON error body.
  // Server-rendered page routes get an HTML error page instead, since returning
  // raw JSON for a page navigation produces a broken, unstyled response.
  const isApiRequest = req.originalUrl.startsWith('/api/') || req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json') &&
      !req.headers.accept.includes('text/html'));

  if (!isApiRequest) {
    return res.status(statusCode).render('errors/error', {
      title: statusCode === 404 ? 'Page Not Found' : 'Something Went Wrong',
      appName: process.env.APP_NAME || 'Queuely',
      statusCode,
      message: escapeHtml(message),
      user: res.locals.user || null,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: message
  });
};

module.exports = errorHandler;
