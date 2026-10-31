const config = require('../config');
const logger = require('../logger');

/**
 * HTTP request logger: method, path, status and duration only, never request bodies or customer data.
 */
function requestLogger(req, res, next) {
  if (config.nodeEnv === 'test') {
    return next();
  }

  const start = Date.now();
  res.on('finish', () => {
    logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }, 'request');
  });

  next();
}

module.exports = requestLogger;
