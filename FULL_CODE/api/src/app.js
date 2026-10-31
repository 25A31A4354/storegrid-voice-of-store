const express = require('express');
const cors = require('cors');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

// Security and utility middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(requestLogger);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'StoreGrid API',
    description: 'Voice-of-Store Engine Backend',
    version: '1.0.0',
    documentation: '/docs/api-contracts.md',
    healthCheck: '/api/health',
  });
});

// Mount all API routes under /api
app.use('/api', apiRoutes);

// Catch unmatched routes (404)
app.use(notFoundHandler);

// Centralized error handling
app.use(errorHandler);

module.exports = app;
