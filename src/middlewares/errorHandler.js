'use strict';

const logger = require('./logger');

/**
 * 404 handler — must be mounted AFTER all routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    detail: `No route matches ${req.method} ${req.path}`,
  });
}

/**
 * Global error handler — must be the last middleware (4 args).
 * Never leaks stack traces in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  logger.error({
    event: 'UNHANDLED_ERROR',
    method: req.method,
    path: req.path,
    statusCode,
    message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  // Prisma-specific errors
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not Found', detail: 'Record not found.' });
  }
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Conflict', detail: 'Duplicate unique constraint.' });
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : message,
    detail: process.env.NODE_ENV !== 'production' ? message : undefined,
  });
}

/**
 * Wrap an async route handler to forward errors to the error handler.
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { notFoundHandler, errorHandler, asyncHandler };
