const feedbackService = require('../services/feedback.service');
const csvService = require('../services/csv.service');

/**
 * POST /api/feedback
 * Submit a single feedback entry
 */
async function create(req, res, next) {
  try {
    const feedback = await feedbackService.createFeedback(req.body);
    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: feedback,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/feedback
 * List feedback with filtering and pagination
 */
async function list(req, res, next) {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await feedbackService.listFeedback(filters, { page, limit });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/feedback/:id
 * Retrieve single feedback by UUID
 */
async function getById(req, res, next) {
  try {
    const feedback = await feedbackService.getFeedbackById(req.params.id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FEEDBACK_NOT_FOUND',
          message: `Feedback record with ID '${req.params.id}' was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: feedback,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/feedback/import
 * Safe CSV file upload or raw CSV string import
 */
async function importCsv(req, res, next) {
  try {
    let csvData = null;

    if (req.file) {
      csvData = req.file.buffer;
    } else if (req.body && req.body.csvContent) {
      csvData = req.body.csvContent;
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CSV_PAYLOAD',
          message: "Please provide a CSV file using 'file' multipart form field or 'csvContent' in JSON body.",
        },
      });
    }

    const provenance = req.body.provenance || 'SYNTHETIC_DEMO';
    const importResult = await csvService.parseAndImportCsv(csvData, { provenance });

    return res.status(200).json({
      success: true,
      message: `CSV processing finished: ${importResult.importedCount} records imported, ${importResult.failedCount} errors.`,
      summary: {
        totalProcessed: importResult.totalProcessed,
        importedCount: importResult.importedCount,
        failedCount: importResult.failedCount,
        provenance,
      },
      sampleImported: importResult.sampleImported,
      errors: importResult.errors,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/feedback/:id/review
 * Review feedback: reclassify category, add notes, or mark resolved
 */
async function reviewFeedback(req, res, next) {
  try {
    const updated = await feedbackService.reviewFeedback(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FEEDBACK_NOT_FOUND',
          message: `Feedback record with ID '${req.params.id}' was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Feedback review updated successfully',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  list,
  getById,
  importCsv,
  reviewFeedback,
};
