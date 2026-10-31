/**
 * Recurring Complaint Detector
 * 
 * Rules for flagging a complaint as a recurring issue:
 * 1. Must share the SAME storeId.
 * 2. Must share the SAME category.
 * 3. The prior complaint must have been RESOLVED or CLOSED before the new complaint occurred.
 * 4. The new complaint must be filed within a recurrence window (default: 14 days) after resolution.
 * 5. Sufficient Evidence Check (Anti-False-Positive):
 *    - To claim two complaints refer to the same specific recurring incident, there must be
 *      concrete matching issue information (e.g., matching itemOrAssetId or identical specific subject).
 *    - Sharing store and category alone is NOT sufficient evidence of the same incident.
 */

const { DEFAULT_CONFIG } = require('./constants');

/**
 * Normalizes text for comparison (removes punctuation, lowercases, trims).
 */
function normalizeText(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

/**
 * Evaluates whether two complaints share sufficient specific evidence
 * to be considered the same incident.
 */
function hasMatchingIssueEvidence(current, prior) {
  // 1. Highest Confidence: Exact Asset or Product ID match (e.g. "POS-02", "REFRIG-A")
  if (current.itemOrAssetId && prior.itemOrAssetId) {
    if (current.itemOrAssetId === prior.itemOrAssetId) {
      return {
        matched: true,
        rule: 'EXACT_ASSET_MATCH',
        detail: `Both complaints reference identical asset/item ID: '${current.itemOrAssetId}'`
      };
    }
    // If both have different explicit asset IDs, they are clearly DIFFERENT incidents
    return {
      matched: false,
      rule: 'DIFFERENT_ASSETS',
      detail: `Asset IDs differ ('${current.itemOrAssetId}' vs '${prior.itemOrAssetId}')`
    };
  }

  // 2. Strong Subject Match: Meaningful non-trivial subject phrases
  const subj1 = normalizeText(current.subject);
  const subj2 = normalizeText(prior.subject);

  if (subj1.length > 5 && subj2.length > 5 && subj1 === subj2) {
    return {
      matched: true,
      rule: 'IDENTICAL_SPECIFIC_SUBJECT',
      detail: `Both complaints report identical issue subject: '${current.subject}'`
    };
  }

  // Insufficient evidence: cannot prove they refer to the exact same incident
  return {
    matched: false,
    rule: 'INSUFFICIENT_EVIDENCE',
    detail: 'Complaints share store and category, but lack matching asset IDs or specific subjects.'
  };
}

/**
 * Scans a list of complaints and detects recurring issues.
 * 
 * @param {Array} complaints - Sanitized complaint objects
 * @param {Object} options - Optional config overrides (recurrenceWindowDays)
 * @returns {Map<string, Object>} Map of complaint ID -> recurrence details
 */
function detectRecurringComplaints(complaints = [], options = {}) {
  const recurrenceMap = new Map();
  const recurrenceWindowDays = options.recurrenceWindowDays || DEFAULT_CONFIG.recurrenceWindowDays;
  const maxWindowMs = recurrenceWindowDays * 24 * 60 * 60 * 1000;

  // Separate resolved past complaints and sort by resolvedAt ascending
  const resolvedPool = complaints
    .filter(c => (c.status === 'RESOLVED' || c.status === 'CLOSED') && c.resolvedAt)
    .sort((a, b) => a.resolvedAt.getTime() - b.resolvedAt.getTime());

  // Check each complaint
  for (const complaint of complaints) {
    // A complaint cannot be a recurrence of itself
    // We check against all resolved complaints that were resolved BEFORE this complaint was created
    const complaintTime = complaint.createdAt.getTime();

    // Candidates in same store and category resolved before complaint creation
    const candidates = resolvedPool.filter(prior => {
      if (prior.id === complaint.id) return false;
      if (prior.storeId !== complaint.storeId) return false;
      if (prior.category !== complaint.category) return false;

      const priorResolutionTime = prior.resolvedAt.getTime();
      const elapsedMs = complaintTime - priorResolutionTime;

      // Must be after resolution, and within the allowed recurrence window
      return elapsedMs > 0 && elapsedMs <= maxWindowMs;
    });

    // Check candidates for sufficient matching evidence
    let matchedRecurrence = null;

    for (const prior of candidates) {
      const evidence = hasMatchingIssueEvidence(complaint, prior);
      if (evidence.matched) {
        const elapsedDays = Number(
          ((complaintTime - prior.resolvedAt.getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
        );

        matchedRecurrence = {
          isRecurring: true,
          confidence: 'HIGH',
          matchingRule: evidence.rule,
          evidenceDetail: evidence.detail,
          previousComplaintId: prior.id,
          previousResolvedAt: prior.resolvedAtISO,
          daysSinceResolution: elapsedDays,
          recurrenceWindowDays
        };
        break; // Match found with strongest candidate
      }
    }

    if (matchedRecurrence) {
      recurrenceMap.set(complaint.id, matchedRecurrence);
    } else {
      recurrenceMap.set(complaint.id, {
        isRecurring: false,
        confidence: 'NONE',
        matchingRule: null,
        evidenceDetail: null,
        previousComplaintId: null
      });
    }
  }

  return recurrenceMap;
}

module.exports = {
  detectRecurringComplaints,
  hasMatchingIssueEvidence
};
