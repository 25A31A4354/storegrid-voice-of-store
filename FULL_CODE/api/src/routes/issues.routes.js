const express = require('express');
const router = express.Router();
const issuesController = require('../controllers/issues.controller');
const {
  validateCreateIssue,
  validateIssueQuery,
  validateAssignmentUpdate,
  validateStatusUpdate,
} = require('../validators/issue.validator');

// Create issue
router.post('/', validateCreateIssue, issuesController.create);

// List issues with pagination & filtering
router.get('/', validateIssueQuery, issuesController.list);

// Get issue details (including linked feedback and audit history)
router.get('/:id', issuesController.getById);

// Update issue assignment (team, assignee, SLA due date)
router.patch('/:id/assignment', validateAssignmentUpdate, issuesController.updateAssignment);

// Update issue status (OPEN, IN_PROGRESS, RESOLVED, REOPENED)
router.patch('/:id/status', validateStatusUpdate, issuesController.updateStatus);

// Get issue chronological audit history
router.get('/:id/history', issuesController.getHistory);

module.exports = router;
