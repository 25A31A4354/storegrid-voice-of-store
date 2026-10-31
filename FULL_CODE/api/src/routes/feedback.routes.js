const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const upload = require('../middleware/upload');
const { validateCreateFeedback, validateFeedbackQuery } = require('../validators/feedback.validator');

// Create single feedback
router.post('/', validateCreateFeedback, feedbackController.create);

// Bulk import feedback from CSV file or text
router.post('/import', upload.single('file'), feedbackController.importCsv);

// List feedback with filtering and pagination
router.get('/', validateFeedbackQuery, feedbackController.list);

// Get feedback by ID
router.get('/:id', feedbackController.getById);

// Review feedback (triage, reclassify category, add notes, mark resolved)
router.patch('/:id/review', feedbackController.reviewFeedback);

module.exports = router;
