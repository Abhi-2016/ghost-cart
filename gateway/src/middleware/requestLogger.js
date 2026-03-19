/**
 * requestLogger.js
 *
 * Concept: Request/Response Logging
 * -----------------------------------
 * Every HTTP request in gets logged on completion with:
 *   - method + path  → what was called
 *   - status         → did it succeed?
 *   - latency_ms     → how long did it take? (key for spotting slow Claude calls)
 *   - request_id     → correlation ID for tracing across gateway + brain logs
 *   - ip             → useful for rate-limit debugging
 *
 * We log on 'finish' (response sent) not on request arrival so we have
 * the status code and latency available in a single log line.
 *
 * Replaces morgan — morgan outputs plain text like:
 *   POST /api/v1/restock/check 200 1240ms
 *
 * This outputs structured JSON:
 *   {"ts":"...","level":"info","service":"gateway","event":"request",
 *    "method":"POST","path":"/api/v1/restock/check","status":200,
 *    "latency_ms":1240,"request_id":"a1b2c3","ip":"::1"}
 */

const { randomUUID } = require('crypto');
const context = require('../lib/requestContext');
const logger = require('../lib/logger');

module.exports = function requestLogger(req, res, next) {
  // Read forwarded ID (from mobile) or generate a new short one
  const requestId = req.headers['x-request-id'] || randomUUID().replace(/-/g, '').slice(0, 8);

  // Echo back so the mobile client and brain can use the same ID
  res.setHeader('X-Request-ID', requestId);

  const startedAt = Date.now();

  res.on('finish', () => {
    const latencyMs = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latency_ms: latencyMs,
      request_id: requestId,
      ip: req.ip,
    });
  });

  // Wrap the rest of the middleware chain in the async context so all
  // downstream code (routes, brainClient) can read getRequestId()
  context.run(requestId, next);
};
