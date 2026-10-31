/**
 * Priority & Trend Detection Module - Constants & Configuration
 * StoreGrid Hackathon Project
 */

// Official agreed categories
const CATEGORIES = Object.freeze({
  STOCK_SHORTAGE: 'STOCK_SHORTAGE',
  BILLING_DELAY: 'BILLING_DELAY',
  STAFF_BEHAVIOUR: 'STAFF_BEHAVIOUR',
  PRODUCT_QUALITY: 'PRODUCT_QUALITY',
  EQUIPMENT_FAILURE: 'EQUIPMENT_FAILURE',
  OTHER: 'OTHER',
  NEEDS_REVIEW: 'NEEDS_REVIEW'
});

const VALID_CATEGORIES = Object.freeze(Object.values(CATEGORIES));

// Priority bands
const PRIORITY_LEVELS = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

// Priority score thresholds
const PRIORITY_THRESHOLDS = Object.freeze({
  CRITICAL_MIN: 80,
  HIGH_MIN: 60,
  MEDIUM_MIN: 35
});

// Category base severity weights (0 - 40 points)
const CATEGORY_WEIGHTS = Object.freeze({
  [CATEGORIES.EQUIPMENT_FAILURE]: 35, // Operational halt / checkout halt / refrigeration
  [CATEGORIES.PRODUCT_QUALITY]: 30,   // Health, expiry, compliance risk
  [CATEGORIES.BILLING_DELAY]: 25,     // Customer friction, checkout queues
  [CATEGORIES.STOCK_SHORTAGE]: 20,    // Revenue loss, customer dissatisfaction
  [CATEGORIES.STAFF_BEHAVIOUR]: 20,   // Store reputation, service quality
  [CATEGORIES.OTHER]: 10,             // Miscellaneous non-critical
  [CATEGORIES.NEEDS_REVIEW]: 15       // Unverified / ambiguous complaints
});

// Default configuration parameters
const DEFAULT_CONFIG = Object.freeze({
  // Spike detection settings
  spikeWindowHours: 24,       // Recent window size in hours (compares last 24h against previous 24h)
  spikeRatioThreshold: 2.0,   // Minimum multiplier (e.g. 2.0x = 100% increase)
  minSpikeVolume: 3,          // Minimum complaint volume in recent window to prevent false alarms on small numbers

  // Recurring issue detection settings
  recurrenceWindowDays: 14,   // Maximum days after resolution to consider a new complaint "recurring"

  // Priority bonus weights
  recurringBonus: 25,         // Points added if complaint is a repeat of a resolved issue
  activeSpikeBonus: 20,       // Points added if the store/category is currently experiencing a spike
  aging48hBonus: 10,          // Points added if unresolved for more than 48 hours
  aging24hBonus: 5,           // Points added if unresolved for 24-48 hours
  highImpactKeywordsBonus: 10 // Points added if high urgency keywords are found in description/subject
});

// High-impact urgency keywords for priority evaluation
const HIGH_IMPACT_KEYWORDS = Object.freeze([
  'urgent', 'emergency', 'fire', 'smoke', 'spark', 'leak', 'flooding',
  'spoiled', 'expired', 'toxic', 'hazard', 'injury', 'food poisoning',
  'system down', 'freeze', 'crash', 'overcharge', 'fraud'
]);

module.exports = {
  CATEGORIES,
  VALID_CATEGORIES,
  PRIORITY_LEVELS,
  PRIORITY_THRESHOLDS,
  CATEGORY_WEIGHTS,
  DEFAULT_CONFIG,
  HIGH_IMPACT_KEYWORDS
};
