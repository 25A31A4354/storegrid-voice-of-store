const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const datasetController = require('../controllers/dataset.controller');

/**
 * POST /api/datasets/preview
 * Analyzes uploaded file (CSV, XLSX, JSON) and returns column headers & sample rows
 */
router.post('/preview', upload.single('file'), datasetController.previewDataset);

/**
 * POST /api/datasets/upload
 * Maps, validates, and persistently imports dataset rows
 */
router.post('/upload', upload.single('file'), datasetController.importDataset);

/**
 * GET /api/datasets
 * Lists all uploaded dataset batches
 */
router.get('/', datasetController.listDatasets);

/**
 * GET /api/datasets/:id
 * Retrieves metadata and summary for a single dataset batch
 */
router.get('/:id', datasetController.getDatasetById);

/**
 * GET /api/datasets/:id/preview
 * Alias for batch details
 */
router.get('/:id/preview', datasetController.getDatasetById);

module.exports = router;
