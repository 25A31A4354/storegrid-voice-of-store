const express = require('express');
const router = express.Router();

const healthRoutes = require('./health.routes');
const feedbackRoutes = require('./feedback.routes');
const issuesRoutes = require('./issues.routes');
const dashboardRoutes = require('./dashboard.routes');
const analyticsRoutes = require('./analytics.routes');
const storesRoutes = require('./stores.routes');
const settingsRoutes = require('./settings.routes');
const datasetRoutes = require('./dataset.routes');

// Health check
router.use('/health', healthRoutes);

// Feedback endpoints
router.use('/feedback', feedbackRoutes);

// Issues endpoints
router.use('/issues', issuesRoutes);

// Dashboard endpoints
router.use('/dashboard', dashboardRoutes);

// Analytics endpoints
router.use('/analytics', analyticsRoutes);

// Stores endpoints
router.use('/stores', storesRoutes);

// Settings endpoints
router.use('/settings', settingsRoutes);

// Dataset upload endpoints
router.use('/datasets', datasetRoutes);

module.exports = router;
