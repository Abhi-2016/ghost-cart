/**
 * requestContext.js
 *
 * Concept: AsyncLocalStorage for correlation IDs
 * -----------------------------------------------
 * Node.js is single-threaded but handles many requests concurrently via the
 * event loop. You can't use a global variable for request IDs — one request
 * would overwrite another's ID.
 *
 * AsyncLocalStorage solves this: it's like a thread-local variable for async
 * code. Each request gets its own isolated storage that persists through
 * all awaits, callbacks, and promises in that request's async tree.
 *
 * How it flows:
 *   requestLogger middleware   → context.run(requestId, next)
 *   route handler              → calls brainClient.checkRestock(payload)
 *   brainClient                → context.getRequestId() returns THIS request's ID
 *   brain receives header      → logs it, echoes in response
 *
 * Result: every log line from both services shares the same request_id,
 * so you can filter logs across services for a single user action.
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

module.exports = {
  /**
   * Wrap a function call in a context that holds the requestId.
   * Called once per request in the requestLogger middleware.
   */
  run: (requestId, fn) => storage.run({ requestId }, fn),

  /**
   * Read the current request's ID from anywhere in the async call stack.
   * Returns '-' if called outside a request context (e.g. at startup).
   */
  getRequestId: () => storage.getStore()?.requestId ?? '-',
};
