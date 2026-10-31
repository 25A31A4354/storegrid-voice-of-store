/**
 * StoreGrid Feedback Service & API Abstraction Layer
 *
 * Architecture Flow:
 * Frontend (React + Vite) -> Node.js / Express Backend (Port 5000) -> SQLite / Python FastAPI NLP (Port 8000)
 *
 * Configured via `VITE_API_BASE_URL`. Defaults to http://localhost:5000.
 * In accordance with integration constraints: Live backend data is fetched directly,
 * and API errors are explicitly thrown/reported to prevent silent fallback to mock data.
 */

import { STORES, RAW_FEEDBACK_DATA, TOP_ISSUES_DATA } from '../data/mockFeedback';
import { OPERATIONAL_CATEGORIES } from '../constants/categories';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

/**
 * Structured API Error with distinction between network connectivity errors and HTTP response errors
 */
export class ApiError extends Error {
  constructor(message, status = null, isNetwork = false, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetwork = isNetwork;
    this.details = details;
  }
}

/**
 * Parse fetch response consistently, unpacking JSON error details when available
 */
async function parseApiResponse(response, defaultMsg) {
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message =
      errBody.error?.message || errBody.message || defaultMsg || `HTTP ${response.status} ${response.statusText}`;
    const details = Array.isArray(errBody.error?.details) ? errBody.error.details : [];
    const formattedMsg = details.length > 0 ? `${message} (${details.join(', ')})` : message;
    throw new ApiError(formattedMsg, response.status, false, details);
  }
  const json = await response.json();
  return json.data !== undefined ? json.data : json;
}

// In-memory working copy for offline fallback or dev testing
let memoryFeedback = [...RAW_FEEDBACK_DATA];

/**
 * Reset memory state back to initial mock dataset (used in settings or offline mode)
 */
export function resetFeedbackData() {
  memoryFeedback = [...RAW_FEEDBACK_DATA];
  return true;
}

/**
 * Fetch list of registered retail stores from backend
 */
export async function getStores() {
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stores`);
      return await parseApiResponse(response, 'Failed to load stores');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid backend', null, true);
    }
  }
  return STORES;
}

/**
 * Filter feedback items by scope in mock fallback mode
 */
function filterByScope(data, storeId, dateRange) {
  return data.filter((item) => {
    const matchStore = !storeId || storeId === 'ALL' || item.storeId === storeId;

    let matchDate = true;
    if (dateRange === 'today') {
      matchDate = item.dateRangeTag === 'today';
    } else if (dateRange === 'last7') {
      matchDate = item.dateRangeTag === 'today' || item.dateRangeTag === 'last7';
    } else if (dateRange === 'last30') {
      matchDate = true;
    }

    return matchStore && matchDate;
  });
}

/**
 * Fetch aggregated dashboard metrics and category overview
 */
export async function getDashboardOverview({ storeId = 'ALL', dateRange = 'last7', batchId = 'ALL' } = {}) {
  if (API_BASE_URL) {
    const params = new URLSearchParams();
    if (storeId && storeId !== 'ALL') params.set('storeId', storeId);
    if (dateRange) params.set('dateRange', dateRange);
    if (batchId && batchId !== 'ALL') params.set('batchId', batchId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard/overview?${params.toString()}`);
      return await parseApiResponse(response, 'Failed to load dashboard overview');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid backend', null, true);
    }
  }

  // Fallback calculation for offline testing
  const scopedFeedback = filterByScope(memoryFeedback, storeId, dateRange);
  const totalCount = scopedFeedback.length;

  const needsAttentionItems = scopedFeedback.filter(
    (item) => (item.priority === 'CRITICAL' || item.priority === 'HIGH') && !item.resolved
  );
  const criticalItems = scopedFeedback.filter((item) => item.priority === 'CRITICAL' && !item.resolved);
  const needsReviewItems = scopedFeedback.filter(
    (item) => item.needsReview === true || item.category === 'NEEDS_REVIEW'
  );

  const categoryCounts = {};
  OPERATIONAL_CATEGORIES.forEach((cat) => {
    categoryCounts[cat] = 0;
  });

  scopedFeedback.forEach((item) => {
    if (OPERATIONAL_CATEGORIES.includes(item.category)) {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    }
  });

  const categoryBreakdown = OPERATIONAL_CATEGORIES.map((catKey) => {
    const count = categoryCounts[catKey] || 0;
    const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
    return {
      categoryId: catKey,
      count,
      percentage,
    };
  });

  const topIssues = TOP_ISSUES_DATA[storeId] || TOP_ISSUES_DATA['STR-HYD-001'] || TOP_ISSUES_DATA['store-001'] || [];

  return {
    storeId,
    dateRange,
    metrics: {
      totalFeedback: totalCount,
      needsAttention: needsAttentionItems.length,
      criticalIssues: criticalItems.length,
      needsReview: needsReviewItems.length,
    },
    categoryBreakdown,
    topIssues,
  };
}

/**
 * Query feedback items with searching, filtering, and review queues
 */
export async function getFeedbackList({
  storeId = 'ALL',
  dateRange = 'last7',
  category = 'ALL',
  priority = 'ALL',
  batchId = 'ALL',
  search = '',
  needsReviewOnly = false,
  page = 1,
  limit = 100,
} = {}) {
  if (API_BASE_URL) {
    const params = new URLSearchParams();
    if (storeId && storeId !== 'ALL') params.set('storeId', storeId);
    if (dateRange && dateRange !== 'ALL') params.set('dateRange', dateRange);
    if (category && category !== 'ALL') params.set('category', category);
    if (priority && priority !== 'ALL') params.set('priority', priority);
    if (batchId && batchId !== 'ALL') params.set('batchId', batchId);
    if (search && search.trim() !== '') params.set('search', search.trim());
    if (needsReviewOnly) params.set('needsReviewOnly', 'true');
    if (page && page > 1) params.set('page', String(page));
    params.set('limit', String(limit || 100));

    try {
      const response = await fetch(`${API_BASE_URL}/api/feedback?${params.toString()}`);
      return await parseApiResponse(response, 'Failed to load feedback list');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid backend', null, true);
    }
  }

  let list = filterByScope(memoryFeedback, storeId, dateRange);

  if (needsReviewOnly) {
    list = list.filter((item) => item.needsReview === true || item.category === 'NEEDS_REVIEW');
  }

  if (category && category !== 'ALL') {
    list = list.filter((item) => item.category === category);
  }

  if (priority && priority !== 'ALL') {
    list = list.filter((item) => item.priority === priority);
  }

  if (search && search.trim() !== '') {
    const query = search.trim().toLowerCase();
    list = list.filter(
      (item) =>
        (item.originalText && item.originalText.toLowerCase().includes(query)) ||
        (item.cleanedText && item.cleanedText.toLowerCase().includes(query)) ||
        (item.category && item.category.toLowerCase().includes(query)) ||
        (item.feedbackId && item.feedbackId.toLowerCase().includes(query)) ||
        (item.matchedTerms && item.matchedTerms.some((t) => t.toLowerCase().includes(query)))
    );
  }

  return list;
}

/**
 * Update feedback review status, reassign category, or mark resolved
 */
export async function updateFeedbackReview(feedbackId, updates) {
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/feedback/${feedbackId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return await parseApiResponse(response, 'Failed to update feedback review');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid backend', null, true);
    }
  }

  // Update in-memory item
  const index = memoryFeedback.findIndex((item) => item.feedbackId === feedbackId);
  if (index !== -1) {
    memoryFeedback[index] = {
      ...memoryFeedback[index],
      ...updates,
      needsReview:
        updates.category && updates.category !== 'NEEDS_REVIEW'
          ? false
          : (updates.needsReview ?? memoryFeedback[index].needsReview),
      confidence: updates.category ? 1.0 : memoryFeedback[index].confidence,
    };
    return memoryFeedback[index];
  }

  throw new Error(`Feedback ${feedbackId} not found`);
}

/**
 * Fetch analytics trends (timeline, spikes, recurring patterns)
 */
export async function getAnalyticsTrends({
  storeId = 'ALL',
  category = 'ALL',
  timeframe = '30d',
  fillGaps = true,
  batchId = 'ALL',
} = {}) {
  if (API_BASE_URL) {
    const params = new URLSearchParams();
    if (storeId && storeId !== 'ALL') params.set('storeId', storeId);
    if (category && category !== 'ALL') params.set('category', category);
    if (timeframe) params.set('timeframe', timeframe);
    if (fillGaps) params.set('fillGaps', 'true');
    if (batchId && batchId !== 'ALL') params.set('batchId', batchId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/trends?${params.toString()}`);
      return await parseApiResponse(response, 'Failed to load analytics trends');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid analytics API', null, true);
    }
  }

  return {
    timeframe,
    timeline: [],
    spikes: [],
    recurringPatterns: [],
  };
}

/**
 * Fetch high-level enterprise dashboard summary metrics
 */
export async function getDashboardSummary() {
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard/summary`);
      return await parseApiResponse(response, 'Failed to load dashboard summary');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid backend', null, true);
    }
  }
  return null;
}

/**
 * Submit a single feedback entry to Express backend (auto-classified via Varshith's NLP microservice)
 */
export async function submitFeedback({
  text,
  storeCode = 'STR-HYD-001',
  storeId,
  sourceType = 'CUSTOMER_REVIEW',
  rating,
  language = 'en',
  customerIdentifier,
  provenance = 'SYNTHETIC_DEMO',
}) {
  if (API_BASE_URL) {
    const payload = {
      text,
      storeCode: storeCode || undefined,
      storeId: storeId || undefined,
      sourceType,
      rating: rating ? parseInt(rating, 10) : undefined,
      language,
      customerIdentifier,
      provenance,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await parseApiResponse(response, 'Failed to submit feedback');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid backend', null, true);
    }
  }

  // Fallback in-memory mutation
  const newFeedback = {
    feedbackId: `FB-MOCK-${Date.now()}`,
    storeId: storeCode,
    originalText: text,
    cleanedText: text.toLowerCase().trim(),
    sourceType,
    rating: rating ? parseInt(rating, 10) : null,
    language,
    category: 'NEEDS_REVIEW',
    priority: 'MEDIUM',
    confidence: 0.5,
    needsReview: true,
    resolved: false,
    matchedTerms: [],
    dateRangeTag: 'today',
    timestamp: new Date().toISOString(),
  };
  memoryFeedback.unshift(newFeedback);
  return newFeedback;
}

/**
 * Fetch persisted system settings from backend
 */
export async function getSystemSettings() {
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings`);
      return await parseApiResponse(response, 'Failed to fetch settings');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to load system settings', null, true);
    }
  }
  return {
    confidenceThreshold: 65,
    confidenceThresholdRatio: 0.65,
    autoFlagCritical: true,
    multilingualNormalization: true,
    allowedThresholds: [40, 65, 90],
    supportedLanguages: ['en', 'hi-Latn', 'ta-Latn', 'mr-Latn'],
    unsupportedLanguages: [],
  };
}

/**
 * Update system settings in backend database
 */
export async function updateSystemSettings(updates) {
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return await parseApiResponse(response, 'Failed to update system settings');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to persist system settings', null, true);
    }
  }
  return updates;
}

/**
 * Fetch dataset breakdown by provenance (synthetic, manual, official)
 */
export async function getDatasetStats() {
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/stats`);
      return await parseApiResponse(response, 'Failed to fetch dataset stats');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to load dataset stats', null, true);
    }
  }
  return {
    syntheticDemo: memoryFeedback.filter((f) => f.provenance === 'SYNTHETIC_DEMO').length,
    manualEntry: memoryFeedback.filter((f) => f.provenance === 'MANUAL_ENTRY').length,
    officialDataset: memoryFeedback.filter((f) => f.provenance === 'OFFICIAL_DATASET').length,
    total: memoryFeedback.length,
  };
}

/**
 * Safe Demo Workspace Reset: resets ONLY synthetic demo data
 */
export async function resetDemoWorkspace() {
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/reset-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return await parseApiResponse(response, 'Failed to reset demo workspace');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to reset demo workspace', null, true);
    }
  }
  resetFeedbackData();
  return {
    success: true,
    message: 'Local mock feedback reset successfully',
  };
}

/**
 * Live health check for backend and NLP microservice
 */
export async function checkConnectivityStatus() {
  const results = {
    backend: {
      status: 'checking',
      available: false,
      url: API_BASE_URL || 'http://localhost:5000',
      latencyMs: null,
      error: null,
      database: null,
      uptime: null,
      isFallback: false,
    },
    nlp: {
      status: 'checking',
      available: false,
      url: 'http://127.0.0.1:8000',
      latencyMs: null,
      error: null,
      service: null,
      version: null,
    },
  };

  // 1. Check Express Backend
  const startBackend = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    results.backend.latencyMs = Math.round(performance.now() - startBackend);

    if (res.ok) {
      const data = await res.json();
      results.backend.status = 'connected';
      results.backend.available = true;
      results.backend.database = data.database?.mode || 'connected';
      results.backend.isFallback = Boolean(data.database?.isFallback);
      results.backend.uptime = data.uptime;

      // Extract NLP status if backend reported it
      if (data.nlpService) {
        if (data.nlpService.available) {
          results.nlp.status = 'connected';
          results.nlp.available = true;
          results.nlp.service = data.nlpService.service;
          results.nlp.version = data.nlpService.version;
        } else {
          results.nlp.status = 'unavailable';
          results.nlp.available = false;
          results.nlp.error = data.nlpService.error || 'NLP microservice unreachable from Express';
        }
      }
    } else {
      results.backend.status = 'unavailable';
      results.backend.error = `HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err) {
    results.backend.status = 'unavailable';
    results.backend.error =
      err.name === 'AbortError' ? 'Connection timed out after 3000ms' : err.message || 'Cannot reach Express server';
  }

  // 2. Direct ping to the classifier: only meaningful when the dashboard runs on the same machine.
  const startNlp = performance.now();
  try {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(API_BASE_URL)) throw new Error('hosted');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://127.0.0.1:8000/health', { signal: controller.signal });
    clearTimeout(timeout);
    results.nlp.latencyMs = Math.round(performance.now() - startNlp);

    if (res.ok) {
      const data = await res.json();
      results.nlp.status = 'connected';
      results.nlp.available = true;
      results.nlp.service = data.service || 'storegrid-nlp';
      results.nlp.version = data.version || '1.0.0';
      results.nlp.error = null;
    } else if (results.nlp.status !== 'connected') {
      results.nlp.status = 'unavailable';
      results.nlp.error = `HTTP ${res.status} from NLP health endpoint`;
    }
  } catch (err) {
    if (err.message === 'hosted') return results;
    if (!results.nlp.available) {
      results.nlp.status = 'unavailable';
      results.nlp.error =
        err.name === 'AbortError'
          ? 'Direct NLP ping timed out'
          : 'NLP microservice offline at 127.0.0.1:8000 (Express baseline regex triage active)';
    }
  }

  return results;
}

/**
 * Fetch unified priority trends analytics
 */
export async function getPriorityTrendsOverview({
  storeId = 'ALL',
  category = 'ALL',
  timeframe = '30d',
  fillGaps = true,
  batchId = 'ALL',
} = {}) {
  if (API_BASE_URL) {
    const params = new URLSearchParams();
    if (storeId && storeId !== 'ALL') params.set('storeId', storeId);
    if (category && category !== 'ALL') params.set('category', category);
    if (timeframe) params.set('timeframe', timeframe);
    if (fillGaps) params.set('fillGaps', 'true');
    if (batchId && batchId !== 'ALL') params.set('batchId', batchId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/priority-trends?${params.toString()}`);
      return await parseApiResponse(response, 'Failed to load priority trends analytics');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Unable to connect to StoreGrid priority-trends API', null, true);
    }
  }
  return null;
}

/**
 * Preview an uploaded dataset file (CSV, XLSX, JSON)
 */
export async function previewDatasetFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/datasets/preview`, {
    method: 'POST',
    body: formData,
  });
  return await parseApiResponse(response, 'Failed to generate dataset preview');
}

/**
 * Upload and process dataset batch with column mapping
 */
export async function uploadDatasetFile(file, columnMapping = {}, batchId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (columnMapping && Object.keys(columnMapping).length > 0) {
    formData.append('columnMapping', JSON.stringify(columnMapping));
  }
  if (batchId) {
    formData.append('batchId', batchId);
  }

  const response = await fetch(`${API_BASE_URL}/api/datasets/upload`, {
    method: 'POST',
    body: formData,
  });
  return await parseApiResponse(response, 'Failed to upload and import dataset');
}

/**
 * List all imported dataset batches
 */
export async function listDatasetBatches() {
  const response = await fetch(`${API_BASE_URL}/api/datasets`);
  return await parseApiResponse(response, 'Failed to load dataset batches');
}

/**
 * Get detailed report for a dataset batch
 */
export async function getDatasetBatch(batchId) {
  const response = await fetch(`${API_BASE_URL}/api/datasets/${batchId}`);
  return await parseApiResponse(response, 'Failed to load dataset batch details');
}
