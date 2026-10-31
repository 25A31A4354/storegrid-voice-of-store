const crypto = require('crypto');
const db = require('../db');
const storeService = require('./store.service');
const nlpService = require('./nlp.service');
const settingsService = require('./settings.service');
const {
  CATEGORIES,
  TAXONOMY_MAP,
  PRIORITIES,
  SOURCE_TYPES,
  PROCESSING_STATUSES,
  PROVENANCES,
  VALID_CATEGORIES,
  VALID_SOURCE_TYPES,
  VALID_PROVENANCES,
} = require('../constants/enums');

/**
 * Justified priority evaluation rule
 * - Checks official taxonomy policy severity floors (e.g. IT10, IT04, IT06, IT08, IT16 have high severity floor).
 * - Assigns CRITICAL only to recognized extreme safety hazards (sparks, fire, lift traps) when autoFlagCritical is enabled.
 * - Respects policy floor: IT10 refrigeration failure gets at least HIGH priority.
 * - General operational issues default to MEDIUM or LOW unless rating or keywords escalate.
 */
function evaluatePriority({ text = '', category = null, rating = null, autoFlagCritical = true }) {
  const lower = (text || '').toLowerCase();

  // 1. Extreme safety hazards (physical safety, electrical, lift trap, fire)
  const isSafetyHazard =
    lower.includes('spark') ||
    lower.includes('electric') ||
    lower.includes('shock') ||
    lower.includes('short circuit') ||
    lower.includes('fire') ||
    lower.includes('smoke') ||
    lower.includes('lift stuck') ||
    lower.includes('elevator stuck') ||
    lower.includes('trapped in lift') ||
    lower.includes('trapped') ||
    lower.includes('slip') ||
    lower.includes('slippery') ||
    lower.includes('broken glass') ||
    lower.includes('injury') ||
    lower.includes('ice cream melted') ||
    lower.includes('water leak') ||
    lower.includes('hazard');

  if (autoFlagCritical && isSafetyHazard) {
    return PRIORITIES.CRITICAL;
  }

  // 2. Official taxonomy policy severity floor
  const taxInfo = TAXONOMY_MAP[category];
  if (taxInfo) {
    if (taxInfo.policyFloor === 'high') {
      return PRIORITIES.HIGH;
    }
    if (taxInfo.policyFloor === 'medium') {
      return PRIORITIES.MEDIUM;
    }
  }

  // Legacy or explicit cold chain / refrigeration failure
  if (category === 'IT10' || (lower.includes('refrigerator') && lower.includes('cooling'))) {
    return PRIORITIES.HIGH;
  }

  // Equipment failure legacy
  if (category === CATEGORIES.EQUIPMENT_FAILURE) {
    return PRIORITIES.HIGH;
  }

  // Critical operational bottlenecks or severe customer dissatisfaction
  if (category === 'IT01' || category === CATEGORIES.BILLING_DELAY || rating === 1) {
    return PRIORITIES.HIGH;
  }

  // Non-issues
  if (category === 'NI01' || category === 'NI02' || category === 'NI03') {
    return PRIORITIES.LOW;
  }

  // Positive or satisfied customer feedback
  if (rating !== null && rating >= 4) {
    return PRIORITIES.LOW;
  }

  // Moderate concerns
  if (
    rating === 2 ||
    category === 'IT03' ||
    category === 'IT15' ||
    category === CATEGORIES.STAFF_BEHAVIOUR ||
    category === CATEGORIES.PRODUCT_QUALITY
  ) {
    return PRIORITIES.MEDIUM;
  }

  // Low / informational complaints or satisfied feedback
  return PRIORITIES.LOW;
}

/**
 * Format feedback database row for API response
 */
function formatFeedback(row) {
  if (!row) return null;
  let metadata = null;
  if (row.metadata) {
    if (typeof row.metadata === 'string') {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = row.metadata; // keep the raw text if it is not JSON
      }
    } else {
      metadata = row.metadata;
    }
  }

  const priority =
    metadata?.priority ||
    evaluatePriority({
      text: row.text,
      category: row.detected_category,
      rating: row.rating !== null ? Number(row.rating) : null,
      autoFlagCritical: true,
    });

  const confidence =
    metadata?.confidence !== undefined
      ? Number(metadata.confidence)
      : row.detected_category === 'NEEDS_REVIEW'
        ? 0.4
        : 0.88;

  const needsReview =
    metadata?.needsReview !== undefined ? Boolean(metadata.needsReview) : row.detected_category === 'NEEDS_REVIEW';

  const resolved = metadata?.resolved === true;

  const nlpMeta = (metadata && typeof metadata === 'object' && metadata.nlp) || {};
  const taxInfo = TAXONOMY_MAP[row.detected_category] || null;

  const matchedTerms = Array.isArray(nlpMeta.matchedTerms) ? nlpMeta.matchedTerms : [];
  const department = nlpMeta.ownerFunction || taxInfo?.owner || 'Store Ops';
  const severity = nlpMeta.severity || taxInfo?.policyFloor || 'low';
  const actionable = nlpMeta.actionable !== undefined ? nlpMeta.actionable : taxInfo ? taxInfo.isActionable : 1;
  const categoryName = nlpMeta.categoryName || taxInfo?.name || row.detected_category;

  return {
    id: row.id,
    feedbackId: row.id,
    storeId: row.store_id,
    storeCode: row.store_code || null,
    storeName: row.store_name || null,
    text: row.text,
    originalText: row.text,
    cleanedText: row.text,
    sourceType: row.source_type,
    timestamp: row.timestamp,
    rating: row.rating !== null ? Number(row.rating) : null,
    language: row.language || 'en',
    category: row.detected_category,
    detectedCategory: row.detected_category,
    categoryName,
    matchedTerms,
    department,
    severity,
    actionable,
    sentiment: row.sentiment || null,
    priority,
    confidence,
    needsReview,
    resolved,
    processingStatus: row.processing_status,
    provenance: row.provenance,
    customerIdentifier: row.customer_identifier || null,
    batchId: row.batch_id || metadata?.batchId || null,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkedIssueCount: row.linked_issue_count !== undefined ? Number(row.linked_issue_count) : undefined,
  };
}

/**
 * Simple baseline heuristic for unclassified feedback
 * Keeps neutral or pending review unless explicit keyword match.
 * Full classification is handled by Varshith's NLP engine.
 */
function baselineCategoryTriage(text, explicitCategory) {
  if (explicitCategory && VALID_CATEGORIES.includes(explicitCategory)) {
    return explicitCategory;
  }
  if (!text) return CATEGORIES.NEEDS_REVIEW;

  const lower = text.toLowerCase();
  if (
    lower.includes('out of stock') ||
    lower.includes('shortage') ||
    lower.includes('empty shelf') ||
    lower.includes('stock ledu') ||
    lower.includes('items levu')
  ) {
    return CATEGORIES.STOCK_SHORTAGE;
  }
  if (
    lower.includes('billing') ||
    lower.includes('counter delay') ||
    lower.includes('long queue') ||
    lower.includes('cashier slow') ||
    lower.includes('pos machine') ||
    lower.includes('billing chala slow')
  ) {
    return CATEGORIES.BILLING_DELAY;
  }
  if (
    lower.includes('rude') ||
    lower.includes('arrogant') ||
    lower.includes('behavior') ||
    lower.includes('staff') ||
    lower.includes('shouted') ||
    lower.includes('mariadaga matladaledu')
  ) {
    return CATEGORIES.STAFF_BEHAVIOUR;
  }
  if (
    lower.includes('expired') ||
    lower.includes('rotten') ||
    lower.includes('damaged') ||
    lower.includes('leaking') ||
    lower.includes('bad quality') ||
    lower.includes('fresh levu')
  ) {
    return CATEGORIES.PRODUCT_QUALITY;
  }
  if (
    lower.includes('ac not working') ||
    lower.includes('a/c') ||
    lower.includes('freezer') ||
    lower.includes('refrigerator') ||
    lower.includes('scanner breakdown') ||
    lower.includes('lift stuck') ||
    lower.includes('work avvatledu')
  ) {
    return CATEGORIES.EQUIPMENT_FAILURE;
  }
  if (
    lower.includes('parking') ||
    lower.includes('store timing') ||
    lower.includes('ambience') ||
    lower.includes('music') ||
    lower.includes('parking space')
  ) {
    return CATEGORIES.OTHER;
  }

  return CATEGORIES.NEEDS_REVIEW;
}

/**
 * Create a single feedback entry with Varshith's NLP service integration
 */
async function createFeedback({
  id: explicitId,
  storeId,
  storeCode,
  text,
  sourceType = SOURCE_TYPES.CUSTOMER_REVIEW,
  timestamp,
  rating,
  language = 'en',
  category,
  sentiment,
  provenance = PROVENANCES.MANUAL_ENTRY,
  customerIdentifier,
  batchId = null,
  metadata,
}) {
  // Resolve store
  let resolvedStoreId = storeId;
  let resolvedStoreCode = storeCode;

  if (!resolvedStoreId && storeCode) {
    const store = await storeService.getStoreByCode(storeCode);
    if (!store) {
      throw new Error(`Store code '${storeCode}' does not exist.`);
    }
    resolvedStoreId = store.id;
    resolvedStoreCode = store.code;
  } else if (resolvedStoreId) {
    const store = await storeService.getStoreById(resolvedStoreId);
    if (!store) {
      // Check if storeId is actually a storeCode
      const byCode = await storeService.getStoreByCode(resolvedStoreId);
      if (byCode) {
        resolvedStoreId = byCode.id;
        resolvedStoreCode = byCode.code;
      } else {
        throw new Error(`Store with ID or Code '${resolvedStoreId}' not found.`);
      }
    } else {
      resolvedStoreCode = store.code;
    }
  }

  if (!resolvedStoreId) {
    throw new Error('storeId or storeCode is required.');
  }

  const id = explicitId || crypto.randomUUID();
  const now = new Date().toISOString();
  const feedbackTimestamp = timestamp ? new Date(timestamp).toISOString() : now;
  const safeSource = VALID_SOURCE_TYPES.includes(sourceType) ? sourceType : SOURCE_TYPES.OTHER;
  const safeProvenance = VALID_PROVENANCES.includes(provenance) ? provenance : PROVENANCES.MANUAL_ENTRY;
  const safeRating = rating ? Math.min(5, Math.max(1, parseInt(rating, 10))) : null;

  // Fetch current persisted system settings
  const settings = await settingsService.getSettings();
  const thresholdRatio = settings.confidenceThresholdRatio; // e.g. 0.65 for 65%

  // Resolve language & multilingual normalization
  let resolvedLanguage = language || 'en';
  const lowerText = text.toLowerCase();
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hindiKeywords = [
    'kripya',
    'bahut',
    'kharab',
    'nahi chal raha',
    'shukriya',
    'kripya',
    'dhanyawad',
    'paise',
    'dukaan',
  ];
  const isHindiDetected = hasDevanagari || hindiKeywords.some((w) => lowerText.includes(w));

  if (settings.multilingualNormalization) {
    // Detect Telugu code-mixed transliteration markers
    const teluguTokens = [
      'ledu',
      'levu',
      'undhi',
      'undi',
      'cheyatledu',
      'avvatledu',
      'chala',
      'assalu',
      'pani cheyatledu',
      'mariadaga',
      'matladaledu',
      'daggara',
      'ekkada',
      'ivvandi',
      'koddiga',
      'bagaledu',
    ];
    const isTeluguScript = /[\u0C00-\u0C7F]/.test(text);
    const hasTeluguToken = isTeluguScript || teluguTokens.some((t) => lowerText.includes(t));

    if (hasTeluguToken && resolvedLanguage === 'en') {
      resolvedLanguage = 'te-en';
    } else if (isHindiDetected && resolvedLanguage === 'en') {
      resolvedLanguage = 'hi';
    }
  } else {
    // When normalization is disabled, transliterated code-mix is not transformed
    resolvedLanguage = 'en';
  }

  // 1. Dispatch classification request to Varshith's FastAPI microservice
  let nlpResult = null;
  try {
    nlpResult = await nlpService.classifyFeedback({
      feedbackId: id,
      storeId: resolvedStoreCode || resolvedStoreId,
      text: text.trim(),
      sourceType: safeSource,
      language: resolvedLanguage,
      createdAt: feedbackTimestamp,
    });
  } catch (err) {
    nlpResult = {
      success: false,
      category: CATEGORIES.NEEDS_REVIEW,
      confidence: 0.0,
      needsReview: true,
      matchedTerms: [],
      nlpStatus: 'UNAVAILABLE',
      error: err.message,
    };
  }

  // 2. Determine final operational category & processing status based on confidence threshold
  let detectedCat;
  let processingStatus;
  let confidenceVal = 0.0;
  let needsReviewFlag = false;

  if (category && VALID_CATEGORIES.includes(category)) {
    // Explicit caller override
    detectedCat = category;
    confidenceVal = 1.0;
    needsReviewFlag = category === CATEGORIES.NEEDS_REVIEW;
    processingStatus = PROCESSING_STATUSES.PROCESSED;
  } else if (nlpResult && nlpResult.success) {
    confidenceVal = typeof nlpResult.confidence === 'number' ? nlpResult.confidence : 0.0;

    // Check against configured threshold
    if (confidenceVal < thresholdRatio) {
      // Below threshold -> Route to NEEDS_REVIEW
      detectedCat = CATEGORIES.NEEDS_REVIEW;
      needsReviewFlag = true;
      processingStatus = PROCESSING_STATUSES.PENDING;
    } else {
      detectedCat = nlpResult.category;
      needsReviewFlag = Boolean(nlpResult.needsReview) || detectedCat === CATEGORIES.NEEDS_REVIEW;
      processingStatus = PROCESSING_STATUSES.PROCESSED;
    }
  } else {
    // Safe fallback when NLP service is offline or returned error
    const heuristicCat = baselineCategoryTriage(text, null);
    const heuristicConfidence = heuristicCat === CATEGORIES.NEEDS_REVIEW ? 0.35 : 0.7;
    confidenceVal = heuristicConfidence;

    if (heuristicConfidence < thresholdRatio || heuristicCat === CATEGORIES.NEEDS_REVIEW) {
      detectedCat = CATEGORIES.NEEDS_REVIEW;
      needsReviewFlag = true;
    } else {
      detectedCat = heuristicCat;
      needsReviewFlag = false;
    }
    processingStatus = PROCESSING_STATUSES.PENDING;
  }

  // 3. Instant escalation & priority assignment
  const assignedPriority = evaluatePriority({
    text: text.trim(),
    category: detectedCat,
    rating: safeRating,
    autoFlagCritical: settings.autoFlagCritical,
  });

  // 4. Assemble rich metadata preserving NLP insights and threshold tracking
  const existingMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  const feedbackMetadata = {
    ...existingMetadata,
    priority: assignedPriority,
    confidence: confidenceVal,
    needsReview: needsReviewFlag,
    thresholdApplied: thresholdRatio,
    languageDetected: resolvedLanguage,
    nlp: {
      category: detectedCat,
      rawCategory: nlpResult?.category || null,
      confidence: confidenceVal,
      needsReview: needsReviewFlag,
      matchedTerms: nlpResult?.matchedTerms || [],
      cleanedText: nlpResult?.cleanedText || text.trim().toLowerCase(),
      serviceStatus: nlpResult?.nlpStatus || 'OFFLINE',
      error: nlpResult?.error || null,
      classifiedAt: nlpResult?.success ? new Date().toISOString() : null,
      severity: nlpResult?.severity || null,
      actionable: nlpResult?.actionable !== undefined ? nlpResult.actionable : 1,
      ownerFunction: nlpResult?.ownerFunction || null,
      categoryName: nlpResult?.categoryName || null,
    },
  };

  const sql = `
    INSERT INTO feedback (
      id, store_id, text, source_type, timestamp, rating, language,
      detected_category, sentiment, processing_status, provenance,
      customer_identifier, metadata, batch_id, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *;
  `;

  const metaString = JSON.stringify(feedbackMetadata);

  const res = await db.query(sql, [
    id,
    resolvedStoreId,
    text.trim(),
    safeSource,
    feedbackTimestamp,
    safeRating,
    resolvedLanguage,
    detectedCat,
    sentiment || null,
    processingStatus,
    safeProvenance,
    customerIdentifier || null,
    metaString,
    batchId || null,
    now,
    now,
  ]);

  return await getFeedbackById(res.rows[0].id);
}

/**
 * Get feedback item by ID with store details and linked issue info
 */
async function getFeedbackById(id) {
  const sql = `
    SELECT 
      f.*,
      s.code as store_code,
      s.name as store_name,
      (SELECT COUNT(*) FROM issue_feedback ifb WHERE ifb.feedback_id = f.id) as linked_issue_count
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE f.id = $1
    LIMIT 1;
  `;
  const res = await db.query(sql, [id]);
  return formatFeedback(res.rows[0]);
}

/**
 * List feedback with filtering, pagination, and sorting
 */
async function listFeedback(filters = {}, pagination = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(pagination.limit, 10) || 100));
  const offset = (page - 1) * limit;

  const conditions = ['1=1'];
  const params = [];
  let paramIdx = 1;

  if (filters.storeId && filters.storeId !== 'ALL' && filters.storeId !== 'all') {
    const storeMap = {
      'store-001': 'STR-HYD-001',
      'store 001': 'STR-HYD-001',
      'store-002': 'STR-VIZ-002',
      'store 002': 'STR-VIZ-002',
      'store-003': 'STR-VJA-003',
      'store 003': 'STR-VJA-003',
      'store-004': 'STR-GNT-004',
      'store 004': 'STR-GNT-004',
      'store-005': 'STR-TPT-005',
      'store 005': 'STR-TPT-005',
    };
    const key = String(filters.storeId).toLowerCase().trim();
    const lookup = storeMap[key] || filters.storeId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookup);
    if (isUuid) {
      conditions.push(`f.store_id = $${paramIdx++}`);
      params.push(lookup);
    } else {
      conditions.push(`s.code = $${paramIdx++}`);
      params.push(lookup.toUpperCase().trim());
    }
  }

  if (filters.category && String(filters.category).toUpperCase() !== 'ALL') {
    conditions.push(`f.detected_category = $${paramIdx++}`);
    params.push(String(filters.category).toUpperCase().trim());
  }

  if (
    filters.needsReviewOnly === 'true' ||
    filters.needsReviewOnly === true ||
    filters.needsReviewOnly === '1' ||
    filters.needsReviewOnly === 1
  ) {
    conditions.push(
      `(f.detected_category = 'NEEDS_REVIEW' OR (f.metadata IS NOT NULL AND f.metadata LIKE '%"needsReview":true%'))`
    );
  }

  if (filters.dateRange) {
    const range = String(filters.dateRange).toLowerCase().trim();
    let days = 30;
    if (range === 'today') days = 1;
    else if (range === 'last7' || range === '7d') days = 7;
    else if (range === 'last30' || range === '30d') days = 30;
    else if (range === '90d') days = 90;
    else if (range === 'all') days = 3650;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    conditions.push(`f.timestamp >= $${paramIdx++}`);
    params.push(cutoff);
  }

  if (filters.sourceType) {
    conditions.push(`f.source_type = $${paramIdx++}`);
    params.push(filters.sourceType);
  }

  if (filters.processingStatus) {
    conditions.push(`f.processing_status = $${paramIdx++}`);
    params.push(filters.processingStatus);
  }

  if (filters.provenance) {
    conditions.push(`f.provenance = $${paramIdx++}`);
    params.push(filters.provenance);
  }

  if (filters.batchId && filters.batchId !== 'ALL' && filters.batchId !== 'all') {
    conditions.push(`f.batch_id = $${paramIdx++}`);
    params.push(filters.batchId);
  }

  if (filters.language) {
    conditions.push(`f.language = $${paramIdx++}`);
    params.push(filters.language);
  }

  if (filters.startDate) {
    conditions.push(`f.timestamp >= $${paramIdx++}`);
    params.push(new Date(filters.startDate).toISOString());
  }

  if (filters.endDate) {
    conditions.push(`f.timestamp <= $${paramIdx++}`);
    params.push(new Date(filters.endDate).toISOString());
  }

  if (filters.search) {
    conditions.push(`LOWER(f.text) LIKE LOWER($${paramIdx++})`);
    params.push(`%${filters.search.trim()}%`);
  }

  const whereClause = conditions.join(' AND ');

  // Total count
  const countSql = `
    SELECT COUNT(*) as total
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${whereClause};
  `;
  const countRes = await db.query(countSql, params);
  const totalRecords = parseInt(countRes.rows[0]?.total || 0, 10);

  // Sorting
  const allowedSortFields = {
    timestamp: 'f.timestamp',
    createdAt: 'f.created_at',
    rating: 'f.rating',
  };
  const sortCol = allowedSortFields[filters.sortBy] || 'f.timestamp';
  const sortDir = filters.sortOrder && filters.sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Data query
  const dataSql = `
    SELECT 
      f.*,
      s.code as store_code,
      s.name as store_name,
      (SELECT COUNT(*) FROM issue_feedback ifb WHERE ifb.feedback_id = f.id) as linked_issue_count
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  params.push(limit, offset);
  const dataRes = await db.query(dataSql, params);

  let formatted = dataRes.rows.map(formatFeedback);

  // Optional priority post-filter if priority is not 'ALL'
  if (filters.priority && filters.priority !== 'ALL') {
    formatted = formatted.filter((item) => item.priority === filters.priority);
  }

  return {
    data: formatted,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit) || 1,
    },
  };
}

/**
 * Review feedback: reclassify category, add manager notes, mark resolved
 */
async function reviewFeedback(id, updates = {}) {
  const existing = await getFeedbackById(id);
  if (!existing) {
    return null;
  }

  const newCategory =
    updates.category && VALID_CATEGORIES.includes(updates.category)
      ? updates.category
      : updates.category || existing.detectedCategory;

  const currentMetadata = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
  const isNowResolved = updates.resolved !== undefined ? Boolean(updates.resolved) : existing.resolved;
  const isStillNeedsReview = newCategory === CATEGORIES.NEEDS_REVIEW && !isNowResolved;

  const newMetadata = {
    ...currentMetadata,
    ...(updates.notes ? { notes: updates.notes } : {}),
    ...(updates.resolved !== undefined ? { resolved: Boolean(updates.resolved) } : {}),
    needsReview: isStillNeedsReview,
    confidence: isStillNeedsReview ? 0.4 : 1.0,
    reviewedAt: new Date().toISOString(),
  };

  const newStatus = !isStillNeedsReview ? PROCESSING_STATUSES.PROCESSED : existing.processingStatus;

  const updateSql = `
    UPDATE feedback
    SET detected_category = $1,
        processing_status = $2,
        metadata = $3,
        updated_at = $4
    WHERE id = $5
    RETURNING *;
  `;
  const res = await db.query(updateSql, [
    newCategory,
    newStatus,
    JSON.stringify(newMetadata),
    new Date().toISOString(),
    id,
  ]);

  if (!res.rows || res.rows.length === 0) {
    return null;
  }

  return formatFeedback(res.rows[0]);
}

module.exports = {
  createFeedback,
  getFeedbackById,
  listFeedback,
  reviewFeedback,
  baselineCategoryTriage,
  evaluatePriority,
  formatFeedback,
};
