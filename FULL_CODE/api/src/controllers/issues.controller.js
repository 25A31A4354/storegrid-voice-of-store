const issueService = require('../services/issue.service');

/**
 * POST /api/issues
 * Create a new issue (optionally linking feedback IDs)
 */
async function create(req, res, next) {
  try {
    const issue = await issueService.createIssue(req.body);
    return res.status(201).json({
      success: true,
      message: 'Issue created successfully',
      data: issue,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/issues
 * List issues with filtering, pagination, and sorting
 */
async function list(req, res, next) {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await issueService.listIssues(filters, { page, limit });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/issues/:id
 * Retrieve issue with store details, linked feedback, and audit history
 */
async function getById(req, res, next) {
  try {
    const issue = await issueService.getIssueById(req.params.id);
    if (!issue) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ISSUE_NOT_FOUND',
          message: `Issue with ID '${req.params.id}' was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: issue,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/issues/:id/assignment
 * Reassign owner team, assignee, or SLA due date
 */
async function updateAssignment(req, res, next) {
  try {
    const updated = await issueService.updateIssueAssignment(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Issue assignment updated successfully',
      data: updated,
    });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ISSUE_NOT_FOUND',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * PATCH /api/issues/:id/status
 * Transition issue status (OPEN, IN_PROGRESS, RESOLVED, REOPENED)
 */
async function updateStatus(req, res, next) {
  try {
    const updated = await issueService.updateIssueStatus(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: `Issue status updated to ${updated.status}`,
      data: updated,
    });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ISSUE_NOT_FOUND',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/issues/:id/history
 * Retrieve chronological audit history for an issue
 */
async function getHistory(req, res, next) {
  try {
    const history = await issueService.getIssueHistory(req.params.id);
    return res.status(200).json({
      success: true,
      data: history,
    });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ISSUE_NOT_FOUND',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

module.exports = {
  create,
  list,
  getById,
  updateAssignment,
  updateStatus,
  getHistory,
};
