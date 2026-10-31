const config = require('../config');
const logger = require('../logger');

/**
 * Global Error Handler Middleware
 * Guarantees uniform error payload format across all API endpoints:
 * {
 *   success: false,
 *   error: {
 *     code: string,
 *     message: string,
 *     details?: any
 *   }
 * }
 */
function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Multer upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Uploaded file exceeds maximum size limit of ${config.maxFileSizeMb}MB.`,
        },
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message,
      },
    });
  }

  // Known validation errors or bad input
  if (err.status === 400 || err.statusCode === 400) {
    return res.status(400).json({
      success: false,
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Invalid request payload',
        details: err.details || null,
      },
    });
  }

  // 404 Not Found errors
  if (err.status === 404 || err.statusCode === 404) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message || 'Resource not found',
      },
    });
  }

  // Default 500 Internal Server Error
  logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');

  const responseError = {
    code: 'INTERNAL_SERVER_ERROR',
    message: config.nodeEnv === 'production' ? 'An unexpected internal server error occurred.' : err.message,
  };

  if (config.nodeEnv !== 'production' && err.stack) {
    responseError.stack = err.stack;
  }

  return res.status(500).json({
    success: false,
    error: responseError,
  });
}

/**
 * 404 Handler for unmatched routes
 */
function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}. Please consult docs/api-contracts.md for available endpoints.`,
    },
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
