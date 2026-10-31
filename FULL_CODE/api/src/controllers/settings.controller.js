const settingsService = require('../services/settings.service');

async function getSettings(req, res, next) {
  try {
    const settings = await settingsService.getSettings();
    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const updates = req.body || {};
    const settings = await settingsService.updateSettings(updates);
    return res.status(200).json({
      success: true,
      data: settings,
      message: 'System settings updated and persisted successfully.',
    });
  } catch (err) {
    if (err.message && err.message.startsWith('Validation failed')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

async function getStats(req, res, next) {
  try {
    const stats = await settingsService.getDatasetCounts();
    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err) {
    next(err);
  }
}

async function resetDemo(req, res, next) {
  try {
    const result = await settingsService.resetDemoWorkspace();
    return res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getStats,
  resetDemo,
};
