const analyticsService = require('../services/analytics.service');

/**
 * GET /api/analytics/trends
 * Aggregates complaint volume trends, spike detection, and recurring complaints.
 * Designed to interface with Sanjay's statistical/ML priority and trend detection module.
 */
async function getTrends(req, res, next) {
  try {
    const { storeId, category, timeframe, fillGaps, batchId } = req.query;
    const trends = await analyticsService.getTrends({
      storeId,
      category,
      timeframe: timeframe || '30d',
      fillGaps: fillGaps === 'true' || fillGaps === '1',
      batchId,
    });

    return res.status(200).json({
      success: true,
      data: trends,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/priority-trends
 * Comprehensive analytics engine powered by Sanjay's priority-trends module.
 * Provides prioritized complaints, store-wise counts, category distributions,
 * spike detection, recurring issue detection, and actionable alerts.
 */
async function getPriorityTrends(req, res, next) {
  try {
    const { storeId, category, timeframe, fillGaps, batchId } = req.query;
    const analytics = await analyticsService.getPriorityTrendsAnalytics({
      storeId,
      category,
      timeframe: timeframe || '30d',
      fillGaps: fillGaps === 'true' || fillGaps === '1',
      batchId,
    });

    return res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/overview
 * High-level operational KPIs and metrics with optional store/dateRange/batch filters.
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
  getTrends,
  getPriorityTrends,
  getOverview,
};
