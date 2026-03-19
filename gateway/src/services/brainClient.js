/**
 * brainClient.js
 *
 * Concept: Service-call logging
 * ------------------------------
 * Every call to the brain is timed and logged with:
 *   - endpoint      → which agent/service was called
 *   - latency_ms    → how long the Claude round-trip took (key cost/perf signal)
 *   - request_id    → forwarded so brain logs share the same correlation ID
 *   - status / error → did it succeed?
 *
 * The X-Request-ID header is forwarded to the brain so both services write
 * the same ID. You can then filter logs across both services in one query:
 *   request_id = "a1b2c3d4"  →  see gateway request + brain agent loop together
 */

const axios = require('axios');
const logger = require('../lib/logger');
const context = require('../lib/requestContext');

const BRAIN_BASE_URL = process.env.BRAIN_BASE_URL || 'http://localhost:8000';
const BRAIN_INTERNAL_SECRET = process.env.BRAIN_INTERNAL_SECRET;

const client = axios.create({
  baseURL: BRAIN_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    ...(BRAIN_INTERNAL_SECRET && { 'X-Internal-Secret': BRAIN_INTERNAL_SECRET }),
  },
});

/**
 * Shared wrapper: times the call, logs success/failure, forwards request ID.
 */
async function callBrain(endpoint, payload) {
  const requestId = context.getRequestId();
  const startedAt = Date.now();

  try {
    const { data } = await client.post(endpoint, payload, {
      headers: { 'X-Request-ID': requestId },
    });
    logger.info('brain.call', {
      endpoint,
      latency_ms: Date.now() - startedAt,
      request_id: requestId,
    });
    return data;
  } catch (err) {
    logger.error('brain.call_failed', {
      endpoint,
      latency_ms: Date.now() - startedAt,
      status: err.response?.status,
      error: err.message,
      request_id: requestId,
    });
    throw err;
  }
}

async function recommend(payload)    { return callBrain('/v1/recommend',      payload); }
async function processIntent(payload) { return callBrain('/v1/process-intent', payload); }
async function checkRestock(payload)  { return callBrain('/v1/restock',        payload); }
async function checkNudge(payload)    { return callBrain('/v1/nudge',          payload); }

module.exports = { recommend, processIntent, checkRestock, checkNudge };
