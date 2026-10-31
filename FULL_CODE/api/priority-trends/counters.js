/**
 * Store-wise and Category-wise Complaint Aggregator
 * Provides breakdown matrices for dashboard views.
 */

const { VALID_CATEGORIES } = require('./constants');

/**
 * Calculates store-wise and category-wise complaint totals.
 * @param {Array} complaints - Sanitized complaint objects
 * @returns {Object} Aggregated count metrics
 */
function calculateCounts(complaints = []) {
  const storeWise = {};
  
  // Initialize every official category to 0 so all agreed categories appear in dashboards
  const categoryWise = {};
  VALID_CATEGORIES.forEach(cat => {
    categoryWise[cat] = 0;
  });

  const storeCategoryMatrix = {};
  const statusWise = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0
  };

  for (const c of complaints) {
    const store = c.storeId || 'UNKNOWN_STORE';
    const cat = c.category || 'NEEDS_REVIEW';
    const status = c.status || 'OPEN';

    // Store-wise count
    storeWise[store] = (storeWise[store] || 0) + 1;

    // Category-wise count
    categoryWise[cat] = (categoryWise[cat] || 0) + 1;

    // Matrix (store -> category)
    if (!storeCategoryMatrix[store]) {
      storeCategoryMatrix[store] = {};
      VALID_CATEGORIES.forEach(k => {
        storeCategoryMatrix[store][k] = 0;
      });
    }
    storeCategoryMatrix[store][cat] = (storeCategoryMatrix[store][cat] || 0) + 1;

    // Status count
    statusWise[status] = (statusWise[status] || 0) + 1;
  }

  return {
    totalComplaints: complaints.length,
    storeWiseCounts: storeWise,
    categoryWiseCounts: categoryWise,
    storeCategoryMatrix,
    statusWiseCounts: statusWise
  };
}

module.exports = {
  calculateCounts
};
