/**
 * Complaint Validator & Sanitizer
 * Safely handles missing, invalid, or malformed fields without throwing errors.
 */

const { VALID_CATEGORIES, CATEGORIES } = require('./constants');

/**
 * Validates and sanitizes a single raw complaint object.
 * Returns { complaint, isValid, warnings }.
 */
function sanitizeComplaint(raw, index = 0) {
  const warnings = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      isValid: false,
      complaint: null,
      warnings: [`Item at index ${index} is not a valid object.`]
    };
  }

  // 1. Complaint ID (supports id, complaint_id, complaintId)
  const rawId = raw.id !== undefined && raw.id !== null ? raw.id : (raw.complaint_id || raw.complaintId);
  let id = rawId ? String(rawId).trim() : '';
  if (!id) {
    id = `CMP-GEN-${index + 1}`;
    warnings.push(`Missing 'id'; auto-assigned fallback '${id}'.`);
  }

  // 2. Store ID (supports storeId, store_id, store)
  const rawStore = raw.storeId || raw.store_id || raw.store;
  let storeId = rawStore ? String(rawStore).trim().toUpperCase() : '';
  if (!storeId) {
    storeId = 'UNKNOWN_STORE';
    warnings.push(`Complaint ${id} is missing 'storeId'; defaulted to 'UNKNOWN_STORE'.`);
  }

  // 3. Category verification & fallback to NEEDS_REVIEW (supports category, predicted_category, predictedCategory, label)
  const rawCategory = raw.category || raw.predicted_category || raw.predictedCategory || raw.label;
  let category = rawCategory ? String(rawCategory).trim().toUpperCase() : '';
  if (!category || !VALID_CATEGORIES.includes(category)) {
    warnings.push(`Complaint ${id} had invalid or missing category '${rawCategory}'; normalized to 'NEEDS_REVIEW'.`);
    category = CATEGORIES.NEEDS_REVIEW;
  }

  // 4. Status normalization (supports status, state)
  const rawStatus = raw.status || raw.state;
  let status = rawStatus ? String(rawStatus).trim().toUpperCase() : 'OPEN';
  if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    status = 'OPEN';
  }

  // 5. Timestamps parsing (supports createdAt, created_at, timestamp, date)
  let createdAt = null;
  const rawCreatedAt = raw.createdAt || raw.created_at || raw.timestamp || raw.date;
  if (rawCreatedAt) {
    const parsed = new Date(rawCreatedAt);
    if (!isNaN(parsed.getTime())) {
      createdAt = parsed;
    } else {
      warnings.push(`Complaint ${id} has invalid createdAt '${rawCreatedAt}'; fallback to current time.`);
      createdAt = new Date();
    }
  } else {
    warnings.push(`Complaint ${id} missing createdAt; fallback to current time.`);
    createdAt = new Date();
  }

  let resolvedAt = null;
  const rawResolvedAt = raw.resolvedAt || raw.resolved_at || raw.closedAt || raw.closed_at;
  if (rawResolvedAt) {
    const parsed = new Date(rawResolvedAt);
    if (!isNaN(parsed.getTime())) {
      resolvedAt = parsed;
    } else {
      warnings.push(`Complaint ${id} has unparseable resolvedAt date '${rawResolvedAt}'.`);
    }
  } else if (status === 'RESOLVED' || status === 'CLOSED') {
    // If marked resolved without a timestamp, default to createdAt
    resolvedAt = createdAt;
  }

  // 6. Text details & target identifiers (supports subject/title/headline and details/description/text/content/message)
  const rawSubject = raw.subject !== undefined && raw.subject !== null
    ? raw.subject
    : (raw.title !== undefined ? raw.title : raw.headline);
  const subject = rawSubject ? String(rawSubject).trim() : '';

  const rawDetails = raw.details !== undefined && raw.details !== null
    ? raw.details
    : (raw.description !== undefined ? raw.description : (raw.text !== undefined ? raw.text : (raw.content !== undefined ? raw.content : raw.message)));
  const details = rawDetails ? String(rawDetails).trim() : '';

  const rawItemOrAsset = raw.itemOrAssetId || raw.item_or_asset_id || raw.itemId || raw.item_id || raw.assetId || raw.asset_id;
  const itemOrAssetId = rawItemOrAsset ? String(rawItemOrAsset).trim().toUpperCase() : null;

  const sanitized = {
    id,
    storeId,
    category,
    status,
    createdAt,
    createdAtISO: createdAt.toISOString(),
    resolvedAt,
    resolvedAtISO: resolvedAt ? resolvedAt.toISOString() : null,
    subject,
    details,
    itemOrAssetId
  };

  return {
    isValid: true,
    complaint: sanitized,
    warnings
  };
}

/**
 * Validates an array of complaints.
 * Safely filters and returns sanitized records along with any validation warnings.
 * Also supports wrapper objects such as { complaints: [...] } or { data: [...] }.
 */
function sanitizeComplaintsList(rawList) {
  let list = rawList;

  // Extract complaints from wrapper objects like { complaints: [...] } or { data: [...] }
  if (rawList && typeof rawList === 'object' && !Array.isArray(rawList)) {
    if (Array.isArray(rawList.complaints)) {
      list = rawList.complaints;
    } else if (Array.isArray(rawList.data)) {
      list = rawList.data;
    }
  }

  if (!Array.isArray(list)) {
    return {
      complaints: [],
      warnings: ['Input data is not an array or a recognized object with a complaints/data array. Returned empty complaints list.']
    };
  }

  const complaints = [];
  const allWarnings = [];

  list.forEach((item, idx) => {
    const result = sanitizeComplaint(item, idx);
    if (result.isValid && result.complaint) {
      complaints.push(result.complaint);
    }
    if (result.warnings.length > 0) {
      allWarnings.push(...result.warnings);
    }
  });

  return {
    complaints,
    warnings: allWarnings
  };
}

module.exports = {
  sanitizeComplaint,
  sanitizeComplaintsList
};
