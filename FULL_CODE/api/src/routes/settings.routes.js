const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');

// GET /api/settings - Read persisted system settings
router.get('/', settingsController.getSettings);

// PATCH /api/settings - Persist NLP threshold, instant escalation, and normalization
router.patch('/', settingsController.updateSettings);

// GET /api/settings/stats - Dataset breakdown by provenance for confirmation dialogs
router.get('/stats', settingsController.getStats);

// POST /api/settings/reset-demo - Safely reset synthetic demo records without touching real data
router.post('/reset-demo', settingsController.resetDemo);

module.exports = router;
