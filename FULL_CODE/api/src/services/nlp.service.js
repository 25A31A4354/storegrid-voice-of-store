const config = require('../config');
const logger = require('../logger');
const { CATEGORIES, VALID_CATEGORIES } = require('../constants/enums');

/**
 * StoreGrid NLP Integration Service
 * Connects Express backend to Varshith's FastAPI Python NLP Microservice.
 *
 * Implements strict SLA timeouts, error isolation, and conservative fallbacks:
 * - If the NLP service is healthy, returns high-precision deterministic category & matched terms.
 * - If the service fails, times out, or returns invalid status, routes safely to NEEDS_REVIEW
 *   without losing the submitted feedback or fabricating artificial probabilities.
 */

/**
 * Check health and liveness of the Python FastAPI NLP service
 * GET /health
 */
async function checkHealth() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  try {
    const res = await fetch(`${config.nlpServiceUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        available: true,
        status: data.status || 'healthy',
        service: data.service || 'storegrid-nlp',
        version: data.version || '1.0.0',
        url: config.nlpServiceUrl,
      };
    }

    return {
      available: false,
      status: `http_${res.status}`,
      url: config.nlpServiceUrl,
      error: `NLP service returned HTTP ${res.status}`,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      available: false,
      status: 'offline',
      url: config.nlpServiceUrl,
      error: err.name === 'AbortError' ? 'NLP health check timed out' : err.message,
    };
  }
}

/**
 * Classify a single feedback text using Varshith's FastAPI NLP service
 * POST /classify
 *
 * @param {Object} params
 * @param {string} params.feedbackId - Unique feedback ID
 * @param {string} params.storeId - Store identifier or code
 * @param {string} params.text - Raw customer/employee feedback
 * @param {string} [params.sourceType="review"] - Source (kiosk, review, staff_note, etc.)
 * @param {string} [params.language="en"] - Language hint (en, te, te-en)
 * @param {string} [params.createdAt] - ISO timestamp
 * @returns {Promise<Object>} Classification result
 */
async function classifyFeedback({ feedbackId, storeId, text, sourceType = 'review', language = 'en', createdAt }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.nlpTimeoutMs);

  const payload = {
    feedbackId: String(feedbackId),
    storeId: String(storeId),
    text: String(text || ''),
    sourceType: sourceType || 'review',
    language: language || 'en',
    createdAt: createdAt || new Date().toISOString(),
  };

  try {
    const res = await fetch(`${config.nlpServiceUrl}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      logger.warn({ status: res.status }, 'Classifier service returned an error'); // its body can echo the comment text
      return {
        success: false,
        category: CATEGORIES.NEEDS_REVIEW,
        confidence: 0.0,
        needsReview: true,
        matchedTerms: [],
        cleanedText: (text || '').trim().toLowerCase(),
        nlpStatus: 'ERROR',
        error: `HTTP ${res.status}: ${errText}`,
      };
    }

    const data = await res.json();

    // Verify category is valid according to our shared contract
    const category = VALID_CATEGORIES.includes(data.category) ? data.category : CATEGORIES.NEEDS_REVIEW;

    return {
      success: true,
      category,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.0,
      needsReview: Boolean(data.needsReview),
      matchedTerms: Array.isArray(data.matchedTerms) ? data.matchedTerms : [],
      cleanedText: data.cleanedText || (text || '').trim().toLowerCase(),
      severity: data.severity || 'low',
      actionable: data.actionable !== undefined ? data.actionable : 1,
      ownerFunction: data.ownerFunction || 'Store Ops',
      categoryName: data.categoryName || '',
      nlpStatus: 'PROCESSED',
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const reason = isTimeout ? `Request timed out after ${config.nlpTimeoutMs}ms` : err.message || 'Network error';

    if (config.nodeEnv !== 'test') {
      logger.warn(
        { url: config.nlpServiceUrl, reason },
        'Classifier service unreachable, sending the comment to review'
      );
    }

    return {
      success: false,
      category: CATEGORIES.NEEDS_REVIEW,
      confidence: 0.0,
      needsReview: true,
      matchedTerms: [],
      cleanedText: (text || '').trim().toLowerCase(),
      nlpStatus: isTimeout ? 'TIMEOUT' : 'UNAVAILABLE',
      error: reason,
    };
  }
}

module.exports = {
  checkHealth,
  classifyFeedback,
};
