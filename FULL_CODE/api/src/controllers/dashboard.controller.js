const analyticsService = require('../services/analytics.service');

/**
 * GET /api/dashboard/summary
 * Provides aggregated operational metrics for Yashwant's React + Vite frontend dashboard
 */
async function getSummary(req, res, next) {
  try {
    const summary = await analyticsService.getDashboardSummary();
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/dashboard/overview
 * Scoped dashboard overview for Yashwant's React + Vite frontend dashboard
 */
async function getOverview(req, res, next) {
  try {
    const { storeId, dateRange, batchId } = req.query;
    const overview = await analyticsService.getDashboardOverview({ storeId, dateRange, batchId });
    return res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getOverview,
};
