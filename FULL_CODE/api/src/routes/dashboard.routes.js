const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');

// GET /api/dashboard/summary (Enterprise aggregated overview)
router.get('/summary', dashboardController.getSummary);

// GET /api/dashboard/overview (Scoped dashboard overview for Yashwant's frontend)
router.get('/overview', dashboardController.getOverview);

module.exports = router;
