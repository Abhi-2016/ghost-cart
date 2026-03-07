/**
 * Central error handler. Catches any error passed to next(err).
 * Never leaks stack traces in production.
 */
function errorHandler(err, _req, res, _next) {
  const isDev = process.env.NODE_ENV !== 'production';

  const status = err.status || err.response?.status || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[gateway:error] ${status} — ${message}`, isDev ? err.stack : '');

  res.status(status).json({
    error: message,
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = errorHandler;
