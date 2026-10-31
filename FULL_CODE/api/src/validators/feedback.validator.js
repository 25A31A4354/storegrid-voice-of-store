const {
  VALID_CATEGORIES,
  VALID_PRIORITIES,
  VALID_SOURCE_TYPES,
  VALID_PROVENANCES,
  VALID_PROCESSING_STATUSES,
} = require('../constants/enums');
const { isValidIsoDate } = require('./common.validator');

/**
 * Validates request payload for POST /api/feedback
 */
function validateCreateFeedback(req, res, next) {
  const { text, storeId, storeCode, rating, category, sourceType, provenance } = req.body || {};
  const errors = [];

  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    errors.push('Feedback text must be at least 3 characters long.');
  }

  if (!storeId && !storeCode) {
    errors.push('Either storeId (UUID) or storeCode is required.');
  }

  if (rating !== undefined && rating !== null) {
    const num = Number(rating);
    if (isNaN(num) || num < 1 || num > 5) {
      errors.push('Rating must be an integer between 1 and 5.');
    }
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    errors.push(`Invalid category '${category}'. Allowed: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
    errors.push(`Invalid sourceType '${sourceType}'. Allowed: ${VALID_SOURCE_TYPES.join(', ')}`);
  }

  if (provenance && !VALID_PROVENANCES.includes(provenance)) {
    errors.push(`Invalid provenance '${provenance}'. Allowed: ${VALID_PROVENANCES.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid feedback creation data',
        details: errors,
      },
    });
  }

  next();
}

/**
 * Validates query parameters for GET /api/feedback
 */
function validateFeedbackQuery(req, res, next) {
  const {
    page,
    limit,
    startDate,
    endDate,
    dateRange,
    category,
    priority,
    needsReviewOnly,
    sourceType,
    processingStatus,
    provenance,
  } = req.query;
  const errors = [];

  if (page && (isNaN(parseInt(page, 10)) || parseInt(page, 10) < 1)) {
    errors.push('Query parameter page must be a positive integer.');
  }

  if (limit && (isNaN(parseInt(limit, 10)) || parseInt(limit, 10) < 1 || parseInt(limit, 10) > 500)) {
    errors.push('Query parameter limit must be between 1 and 500.');
  }

  if (startDate && !isValidIsoDate(startDate)) {
    errors.push('Query parameter startDate must be a valid ISO-8601 date string.');
  }

  if (endDate && !isValidIsoDate(endDate)) {
    errors.push('Query parameter endDate must be a valid ISO-8601 date string.');
  }

  if (dateRange && !['today', 'last7', 'last30', 'all', '7d', '30d', '90d'].includes(String(dateRange).toLowerCase())) {
    errors.push(`Invalid dateRange filter '${dateRange}'. Allowed: today, last7, last30, all`);
  }

  if (
    category &&
    String(category).toUpperCase() !== 'ALL' &&
    !VALID_CATEGORIES.includes(String(category).toUpperCase())
  ) {
    errors.push(`Invalid category filter '${category}'. Allowed: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (
    priority &&
    String(priority).toUpperCase() !== 'ALL' &&
    !VALID_PRIORITIES.includes(String(priority).toUpperCase())
  ) {
    errors.push(`Invalid priority filter '${priority}'. Allowed: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (needsReviewOnly !== undefined && !['true', 'false', '1', '0'].includes(String(needsReviewOnly).toLowerCase())) {
    errors.push("Query parameter needsReviewOnly must be 'true' or 'false'.");
  }

  if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
    errors.push(`Invalid sourceType filter '${sourceType}'. Allowed: ${VALID_SOURCE_TYPES.join(', ')}`);
  }

  if (processingStatus && !VALID_PROCESSING_STATUSES.includes(processingStatus)) {
    errors.push(
      `Invalid processingStatus filter '${processingStatus}'. Allowed: ${VALID_PROCESSING_STATUSES.join(', ')}`
    );
  }

  if (provenance && !VALID_PROVENANCES.includes(provenance)) {
    errors.push(`Invalid provenance filter '${provenance}'. Allowed: ${VALID_PROVENANCES.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'QUERY_VALIDATION_ERROR',
        message: 'Invalid feedback query parameters',
        details: errors,
      },
    });
  }

  next();
}

module.exports = {
  validateCreateFeedback,
  validateFeedbackQuery,
};
