const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');

// GET /api/analytics/trends
router.get('/trends', analyticsController.getTrends);

// GET /api/analytics/priority-trends
router.get('/priority-trends', analyticsController.getPriorityTrends);

// GET /api/analytics/overview
router.get('/overview', analyticsController.getOverview);

module.exports = router;
