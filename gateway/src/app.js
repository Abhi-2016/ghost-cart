const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const cartRouter = require('./routes/cart');
const intentRouter = require('./routes/intent');
const storesRouter = require('./routes/stores');
const restockRouter = require('./routes/restock');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet());

// Request logging
app.use(morgan('dev'));

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

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
