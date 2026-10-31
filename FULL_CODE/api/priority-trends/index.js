/**
 * Priority & Trend Detection Module - Main Orchestrator
 * StoreGrid Hackathon Project
 * 
 * Provides end-to-end analytics, spike detection, recurring issue detection,
 * and rule-based priority scoring formatted for dashboard display.
 */

const {
  CATEGORIES,
  VALID_CATEGORIES,
  PRIORITY_LEVELS,
  DEFAULT_CONFIG
} = require('./constants');
const { sanitizeComplaintsList, sanitizeComplaint } = require('./validator');
const { calculateCounts } = require('./counters');
const { detectSpikes } = require('./spikeDetector');
const { detectRecurringComplaints } = require('./recurringDetector');
const { scoreComplaint } = require('./priorityScorer');

/**
 * Main analytics pipeline: processes raw complaints and returns a dashboard-ready JSON report.
 * 
 * @param {Array} rawComplaints - Array of raw complaint objects from JSON or API
 * @param {Object} options - Configuration overrides (e.g. windowHours, referenceTime)
 * @returns {Object} Dashboard-ready analytics JSON
 */
function analyzeComplaints(rawComplaints = [], options = {}) {
  // 1. Sanitize & validate incoming complaints
  const { complaints, warnings } = sanitizeComplaintsList(rawComplaints);

  if (complaints.length === 0) {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalInput: Array.isArray(rawComplaints)
          ? rawComplaints.length
          : (rawComplaints && typeof rawComplaints === 'object' && (Array.isArray(rawComplaints.complaints) ? rawComplaints.complaints.length : (Array.isArray(rawComplaints.data) ? rawComplaints.data.length : 0))) || 0,
        validComplaints: 0,
        status: 'EMPTY_DATASET'
      },
      summary: {
        totalComplaints: 0,
        openComplaints: 0,
        resolvedComplaints: 0,
        criticalPriorityCount: 0,
        highPriorityCount: 0,
        mediumPriorityCount: 0,
        lowPriorityCount: 0,
        activeSpikesCount: 0,
        recurringComplaintsCount: 0
      },
      storeWiseCounts: {},
      categoryWiseCounts: VALID_CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {}),
      storeCategoryMatrix: {},
      spikes: [],
      recurringIssues: [],
      prioritizedComplaints: [],
      unresolvedPrioritizedComplaints: [],
      dashboardAlerts: [],
      validationWarnings: warnings
    };
  }

  // 2. Compute Store & Category Counts
  const countMetrics = calculateCounts(complaints);

  // 3. Detect Sudden Spikes
  const spikeResults = detectSpikes(complaints, options);

  // 4. Detect Recurring Complaints
  const recurrenceMap = detectRecurringComplaints(complaints, options);

  // 5. Score Priorities for each complaint
  const refTime = options.referenceTime || spikeResults.windowDetails?.referenceTime || new Date();
  
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  const recurringIssues = [];

  const prioritizedComplaints = complaints.map(complaint => {
    const recurrenceInfo = recurrenceMap.get(complaint.id) || { isRecurring: false };
    const priority = scoreComplaint(complaint, {
      recurrenceInfo,
      spikeLookup: spikeResults.spikeLookup,
      referenceTime: refTime,
      config: options
    });

    if (priority.level === PRIORITY_LEVELS.CRITICAL) criticalCount++;
    else if (priority.level === PRIORITY_LEVELS.HIGH) highCount++;
    else if (priority.level === PRIORITY_LEVELS.MEDIUM) mediumCount++;
    else lowCount++;

    const enriched = {
      id: complaint.id,
      storeId: complaint.storeId,
      category: complaint.category,
      status: complaint.status,
      subject: complaint.subject,
      details: complaint.details,
      itemOrAssetId: complaint.itemOrAssetId,
      createdAt: complaint.createdAtISO,
      resolvedAt: complaint.resolvedAtISO,
      priority: {
        score: priority.score,
        level: priority.level,
        explanations: priority.explanations,
        factorBreakdown: priority.factorBreakdown
      },
      recurrence: recurrenceInfo
    };

    if (recurrenceInfo.isRecurring) {
      recurringIssues.push({
        complaintId: complaint.id,
        storeId: complaint.storeId,
        category: complaint.category,
        subject: complaint.subject,
        itemOrAssetId: complaint.itemOrAssetId,
        previousComplaintId: recurrenceInfo.previousComplaintId,
        daysSinceResolution: recurrenceInfo.daysSinceResolution,
        evidence: recurrenceInfo.evidenceDetail
      });
    }

    return enriched;
  });

  // Sort complaints by priority score descending
  prioritizedComplaints.sort((a, b) => b.priority.score - a.priority.score);

  // 6. Generate High-Level Dashboard Alert Banners
  const dashboardAlerts = [];

  // Add spike alerts
  spikeResults.spikes.forEach(s => {
    dashboardAlerts.push({
      type: 'SPIKE_WARNING',
      severity: s.severity,
      message: s.alertMessage,
      targetStore: s.storeId,
      targetCategory: s.category
    });
  });

  // Add critical priority alerts for unresolved issues
  prioritizedComplaints
    .filter(c => c.priority.level === PRIORITY_LEVELS.CRITICAL && c.status !== 'RESOLVED' && c.status !== 'CLOSED')
    .slice(0, 5) // top 5 critical
    .forEach(c => {
      dashboardAlerts.push({
        type: 'CRITICAL_ISSUE',
        severity: 'CRITICAL',
        message: `Critical Issue ${c.id} at ${c.storeId} [${c.category}]: ${c.subject || 'Needs immediate action'}`,
        complaintId: c.id,
        priorityScore: c.priority.score
      });
    });

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalInput: Array.isArray(rawComplaints)
        ? rawComplaints.length
        : (rawComplaints && typeof rawComplaints === 'object' && (Array.isArray(rawComplaints.complaints) ? rawComplaints.complaints.length : (Array.isArray(rawComplaints.data) ? rawComplaints.data.length : 0))) || 0,
      validComplaints: complaints.length,
      referenceTimeUsed: refTime instanceof Date ? refTime.toISOString() : String(refTime),
      status: 'SUCCESS'
    },
    summary: {
      totalComplaints: complaints.length,
      openComplaints: countMetrics.statusWiseCounts.OPEN,
      inProgressComplaints: countMetrics.statusWiseCounts.IN_PROGRESS,
      resolvedComplaints: countMetrics.statusWiseCounts.RESOLVED + countMetrics.statusWiseCounts.CLOSED,
      criticalPriorityCount: criticalCount,
      highPriorityCount: highCount,
      mediumPriorityCount: mediumCount,
      lowPriorityCount: lowCount,
      activeSpikesCount: spikeResults.spikes.length,
      recurringComplaintsCount: recurringIssues.length
    },
    storeWiseCounts: countMetrics.storeWiseCounts,
    categoryWiseCounts: countMetrics.categoryWiseCounts,
    storeCategoryMatrix: countMetrics.storeCategoryMatrix,
    spikes: spikeResults.spikes,
    recurringIssues,
    prioritizedComplaints,
    unresolvedPrioritizedComplaints: prioritizedComplaints.filter(
      c => c.status !== 'RESOLVED' && c.status !== 'CLOSED'
    ),
    dashboardAlerts,
    validationWarnings: warnings
  };
}

module.exports = {
  analyzeComplaints,
  calculateCounts,
  detectSpikes,
  detectRecurringComplaints,
  scoreComplaint,
  sanitizeComplaint,
  sanitizeComplaintsList,
  CATEGORIES,
  VALID_CATEGORIES,
  PRIORITY_LEVELS,
  DEFAULT_CONFIG
};
