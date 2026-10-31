const {
  VALID_CATEGORIES,
  VALID_PRIORITIES,
  VALID_ISSUE_STATUSES,
  VALID_OWNER_TEAMS,
  ISSUE_STATUSES,
} = require('../constants/enums');
const { isValidIsoDate } = require('./common.validator');

/**
 * Validates issue creation request body
 */
function validateCreateIssue(req, res, next) {
  const { title, storeId, storeCode, category, priority, status, ownerTeam, dueDate } = req.body;
  const errors = [];

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Issue title is required.');
  }

  if (!storeId && !storeCode) {
    errors.push('Either storeId or storeCode is required.');
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    errors.push(`Invalid category '${category}'. Allowed: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    errors.push(`Invalid priority '${priority}'. Allowed: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (status && !VALID_ISSUE_STATUSES.includes(status)) {
    errors.push(`Invalid status '${status}'. Allowed: ${VALID_ISSUE_STATUSES.join(', ')}`);
  }

  if (ownerTeam && !VALID_OWNER_TEAMS.includes(ownerTeam)) {
    errors.push(`Invalid ownerTeam '${ownerTeam}'. Allowed: ${VALID_OWNER_TEAMS.join(', ')}`);
  }

  if (dueDate && !isValidIsoDate(dueDate)) {
    errors.push('Invalid dueDate format. Expected ISO-8601 string.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid issue creation data',
        details: errors,
      },
    });
  }

  next();
}

/**
 * Validates PATCH /api/issues/:id/assignment
 */
function validateAssignmentUpdate(req, res, next) {
  const { ownerTeam, dueDate } = req.body;
  const errors = [];

  if (ownerTeam && !VALID_OWNER_TEAMS.includes(ownerTeam)) {
    errors.push(`Invalid ownerTeam '${ownerTeam}'. Allowed: ${VALID_OWNER_TEAMS.join(', ')}`);
  }

  if (dueDate && !isValidIsoDate(dueDate)) {
    errors.push('Invalid dueDate format. Expected ISO-8601 string.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid assignment update payload',
        details: errors,
      },
    });
  }

  next();
}

/**
 * Validates PATCH /api/issues/:id/status
 */
function validateStatusUpdate(req, res, next) {
  const { status, resolutionNotes } = req.body;
  const errors = [];

  if (!status) {
    errors.push('Status field is required.');
  } else if (!VALID_ISSUE_STATUSES.includes(status)) {
    errors.push(`Invalid status '${status}'. Allowed: ${VALID_ISSUE_STATUSES.join(', ')}`);
  }

  // If status is transitioning to RESOLVED, resolutionNotes are recommended / expected
  if (status === ISSUE_STATUSES.RESOLVED && resolutionNotes !== undefined && typeof resolutionNotes !== 'string') {
    errors.push('resolutionNotes must be a string.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid status update payload',
        details: errors,
      },
    });
  }

  next();
}

/**
 * Validates query parameters for GET /api/issues
 */
function validateIssueQuery(req, res, next) {
  const { page, limit, status, priority, category, ownerTeam } = req.query;
  const errors = [];

  if (page && (isNaN(parseInt(page, 10)) || parseInt(page, 10) < 1)) {
    errors.push('Query parameter page must be a positive integer.');
  }

  if (limit && (isNaN(parseInt(limit, 10)) || parseInt(limit, 10) < 1 || parseInt(limit, 10) > 100)) {
    errors.push('Query parameter limit must be between 1 and 100.');
  }

  if (status && !VALID_ISSUE_STATUSES.includes(status)) {
    errors.push(`Invalid status filter '${status}'. Allowed: ${VALID_ISSUE_STATUSES.join(', ')}`);
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    errors.push(`Invalid priority filter '${priority}'. Allowed: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    errors.push(`Invalid category filter '${category}'. Allowed: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (ownerTeam && !VALID_OWNER_TEAMS.includes(ownerTeam)) {
    errors.push(`Invalid ownerTeam filter '${ownerTeam}'. Allowed: ${VALID_OWNER_TEAMS.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'QUERY_VALIDATION_ERROR',
        message: 'Invalid issues query parameters',
        details: errors,
      },
    });
  }

  next();
}

module.exports = {
  validateCreateIssue,
  validateAssignmentUpdate,
  validateStatusUpdate,
  validateIssueQuery,
};
