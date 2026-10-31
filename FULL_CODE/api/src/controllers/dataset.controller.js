const datasetService = require('../services/dataset.service');

/**
 * POST /api/datasets/preview
 * Analyzes uploaded file (CSV, XLSX, JSON) and returns column headers & sample rows
 */
async function previewDataset(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FILE',
          message: 'No file uploaded. Please upload a CSV, XLSX, or JSON file.',
        },
      });
    }

    const preview = await datasetService.previewDataset({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    return res.status(200).json({
      success: true,
      data: preview,
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/datasets/upload
 * Validates, maps, and imports dataset into feedback database with priority-trends analytics
 */
async function importDataset(req, res, next) {
  try {
    if (!req.file && !req.body.fileContent) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PAYLOAD',
          message: 'No file or fileContent was provided for dataset import.',
        },
      });
    }

    let buffer = null;
    let filename = req.file?.originalname || req.body.filename || 'uploaded_dataset.csv';
    let mimetype = req.file?.mimetype || 'text/csv';

    if (req.file) {
      buffer = req.file.buffer;
    } else if (req.body.fileContent) {
      buffer = Buffer.from(req.body.fileContent, 'utf-8');
    }

    let columnMapping = {};
    if (req.body.columnMapping) {
      try {
        columnMapping =
          typeof req.body.columnMapping === 'string' ? JSON.parse(req.body.columnMapping) : req.body.columnMapping;
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_MAPPING',
            message: `Malformed columnMapping JSON: ${err.message}`,
          },
        });
      }
    }

    const result = await datasetService.importDataset({
      buffer,
      filename,
      mimetype,
      columnMapping,
      batchId: req.body.batchId,
    });

    return res.status(201).json({
      success: true,
      data: result,
      message: `Successfully imported ${result.importedCount} records into StoreGrid.`,
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATASET',
          message: err.message,
        },
      });
    }

    next(err);
  }
}

/**
 * GET /api/datasets
 * Lists all uploaded dataset batches
 */
async function listDatasets(req, res, next) {
  try {
    const batches = await datasetService.listBatches();
    return res.status(200).json({
      success: true,
      data: batches,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/datasets/:id
 * Retrieves details for a specific dataset batch
 */
async function getDatasetById(req, res, next) {
  try {
    const batch = await datasetService.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DATASET_NOT_FOUND',
          message: `Dataset batch with ID '${req.params.id}' not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: batch,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  previewDataset,
  importDataset,
  listDatasets,
  getDatasetById,
};
