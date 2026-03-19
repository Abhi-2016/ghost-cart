/**
 * logger.js
 *
 * Concept: Why not just console.log?
 * ------------------------------------
 * console.log("Request took 240ms") → plain string, unqueryable
 * logger.info("brain.call", { latency_ms: 240 }) → JSON object, every field queryable
 *
 * In production (Railway/Render), stdout is automatically captured.
 * You can pipe it to Datadog / Logtail / Papertrail later by adding one
 * environment variable — no code changes needed.
 *
 * Log levels (lowest to highest):
 *   debug → verbose detail, off by default in production
 *   info  → normal operations (request in, cache hit, brain call complete)
 *   warn  → unexpected but not fatal (slow brain response, rate limit hit)
 *   error → something broke (unhandled exception, brain 500)
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info('cache.hit',  { key: 'recommend:...', request_id: '...' });
 *   logger.error('brain.error', { endpoint: '/v1/restock', error: err.message });
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function log(level, event, fields = {}) {
  if ((LEVELS[level] ?? 0) < currentLevel) return;

  // JSON.stringify writes to one line — essential for log parsers
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: 'gateway',
      event,
      ...fields,
    }) + '\n'
  );
}

module.exports = {
  debug: (event, fields) => log('debug', event, fields),
  info:  (event, fields) => log('info',  event, fields),
  warn:  (event, fields) => log('warn',  event, fields),
  error: (event, fields) => log('error', event, fields),
};
