const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const cartRouter = require('./routes/cart');
const intentRouter = require('./routes/intent');
const storesRouter = require('./routes/stores');
const restockRouter = require('./routes/restock');
const nudgeRouter = require('./routes/nudge');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const app = express();

// Security headers
app.use(helmet());

// Structured JSON request logging (replaces morgan)
// Assigns X-Request-ID and wraps each request in AsyncLocalStorage context
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '256kb' }));

// Rate limiting — 60 req/min per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

// Routes
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/intent', intentRouter);
app.use('/api/v1/stores', storesRouter);
app.use('/api/v1/restock', restockRouter);
app.use('/api/v1/nudge', nudgeRouter);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
