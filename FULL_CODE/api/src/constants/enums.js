/**
 * StoreGrid System Enums & Identifier Constants
 * Standardized across Backend, NLP (Varshit), Analytics (Sanjay), and Frontend (Yashwant).
 */

// Official Talent AP Mega Hackathon 2026 Problem R5 Taxonomy
const OFFICIAL_R5_CATEGORIES = Object.freeze({
  IT01: 'IT01', // Long checkout queue / slow billing
  IT02: 'IT02', // Understaffing / staff shortage on floor
  IT03: 'IT03', // Unhelpful or poorly trained staff
  IT04: 'IT04', // Staff misconduct (abusive, harassment, cheating customers)
  IT05: 'IT05', // Staff welfare grievance
  IT06: 'IT06', // Hygiene lapse (pests, dirty food areas, foul smell)
  IT07: 'IT07', // Store untidy / poor upkeep
  IT08: 'IT08', // Physical safety hazard (wet floor, wiring, falling stock)
  IT09: 'IT09', // Roof leak / water seepage
  IT10: 'IT10', // Refrigeration / cold-chain failure
  IT11: 'IT11', // Equipment breakdown (AC, lift, lights, scale, POS)
  IT12: 'IT12', // Carry-bag charge / checkout packing
  IT13: 'IT13', // Parking, access or store timings
  IT14: 'IT14', // Out of stock / empty shelves
  IT15: 'IT15', // Poor quality fresh produce
  IT16: 'IT16', // Expired / near-expiry product on shelf
  IT17: 'IT17', // Foreign object / contamination in product
  IT18: 'IT18', // Allergen / ingredient labelling error
  IT19: 'IT19', // Shelf price vs bill price mismatch
  IT20: 'IT20', // Promotion / offer not applied
  IT21: 'IT21', // Private-label product quality
  IT22: 'IT22', // Assortment request / product not carried
  IT23: 'IT23', // Online order delivery delay / missed slot
  IT24: 'IT24', // Wrong or missing items in online order
  IT25: 'IT25', // Damaged or leaking items on delivery
  IT26: 'IT26', // App / website crash, login or bug
  IT27: 'IT27', // Payment failure / money debited but order failed
  IT28: 'IT28', // Refund / return not processed
  IT29: 'IT29', // Loyalty points / coupon problem
  IT30: 'IT30', // Billing error at counter (double scan, wrong weight/qty)
  NI01: 'NI01', // Praise / compliment
  NI02: 'NI02', // General comment / suggestion / question
  NI03: 'NI03', // Spam / irrelevant
});

// Full metadata from R5 issue_taxonomy.csv
const TAXONOMY_MAP = Object.freeze({
  IT01: {
    id: 'IT01',
    name: 'Long checkout queue / slow billing',
    owner: 'Store Ops',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT02: {
    id: 'IT02',
    name: 'Understaffing / staff shortage on floor',
    owner: 'HR',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT03: { id: 'IT03', name: 'Unhelpful or poorly trained staff', owner: 'HR', policyFloor: 'low', isActionable: 1 },
  IT04: {
    id: 'IT04',
    name: 'Staff misconduct (abusive, harassment, cheating customers)',
    owner: 'HR',
    policyFloor: 'high',
    isActionable: 1,
  },
  IT05: { id: 'IT05', name: 'Staff welfare grievance', owner: 'HR', policyFloor: 'low', isActionable: 1 },
  IT06: {
    id: 'IT06',
    name: 'Hygiene lapse (pests, dirty food areas, foul smell)',
    owner: 'Store Ops',
    policyFloor: 'high',
    isActionable: 1,
  },
  IT07: { id: 'IT07', name: 'Store untidy / poor upkeep', owner: 'Store Ops', policyFloor: 'low', isActionable: 1 },
  IT08: {
    id: 'IT08',
    name: 'Physical safety hazard (wet floor, wiring, falling stock)',
    owner: 'Store Ops',
    policyFloor: 'high',
    isActionable: 1,
  },
  IT09: { id: 'IT09', name: 'Roof leak / water seepage', owner: 'Store Ops', policyFloor: 'low', isActionable: 1 },
  IT10: {
    id: 'IT10',
    name: 'Refrigeration / cold-chain failure',
    owner: 'Store Ops',
    policyFloor: 'high',
    isActionable: 1,
  },
  IT11: {
    id: 'IT11',
    name: 'Equipment breakdown (AC, lift, lights, scale, POS)',
    owner: 'Store Ops',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT12: {
    id: 'IT12',
    name: 'Carry-bag charge / checkout packing',
    owner: 'Store Ops',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT13: {
    id: 'IT13',
    name: 'Parking, access or store timings',
    owner: 'Store Ops',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT14: {
    id: 'IT14',
    name: 'Out of stock / empty shelves',
    owner: 'Supply Chain',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT15: { id: 'IT15', name: 'Poor quality fresh produce', owner: 'Supply Chain', policyFloor: 'low', isActionable: 1 },
  IT16: {
    id: 'IT16',
    name: 'Expired / near-expiry product on shelf',
    owner: 'Store Ops',
    policyFloor: 'high',
    isActionable: 1,
  },
  IT17: {
    id: 'IT17',
    name: 'Foreign object / contamination in product',
    owner: 'Merchandising',
    policyFloor: 'high',
    isActionable: 1,
  },
  IT18: {
    id: 'IT18',
    name: 'Allergen / ingredient labelling error',
    owner: 'Merchandising',
    policyFloor: 'high',
    isActionable: 1,
  },
  IT19: {
    id: 'IT19',
    name: 'Shelf price vs bill price mismatch',
    owner: 'Merchandising',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT20: {
    id: 'IT20',
    name: 'Promotion / offer not applied',
    owner: 'Merchandising',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT21: {
    id: 'IT21',
    name: 'Private-label product quality',
    owner: 'Merchandising',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT22: {
    id: 'IT22',
    name: 'Assortment request / product not carried',
    owner: 'Merchandising',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT23: {
    id: 'IT23',
    name: 'Online order delivery delay / missed slot',
    owner: 'Supply Chain',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT24: {
    id: 'IT24',
    name: 'Wrong or missing items in online order',
    owner: 'Supply Chain',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT25: {
    id: 'IT25',
    name: 'Damaged or leaking items on delivery',
    owner: 'Supply Chain',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT26: {
    id: 'IT26',
    name: 'App / website crash, login or bug',
    owner: 'Digital',
    policyFloor: 'low',
    isActionable: 1,
  },
  IT27: {
    id: 'IT27',
    name: 'Payment failure / money debited but order failed',
    owner: 'Digital',
    policyFloor: 'medium',
    isActionable: 1,
  },
  IT28: { id: 'IT28', name: 'Refund / return not processed', owner: 'Digital', policyFloor: 'low', isActionable: 1 },
  IT29: { id: 'IT29', name: 'Loyalty points / coupon problem', owner: 'Digital', policyFloor: 'low', isActionable: 1 },
  IT30: {
    id: 'IT30',
    name: 'Billing error at counter (double scan, wrong weight/qty)',
    owner: 'Store Ops',
    policyFloor: 'low',
    isActionable: 1,
  },
  NI01: {
    id: 'NI01',
    name: 'Praise / compliment',
    owner: 'None (not actionable)',
    policyFloor: 'low',
    isActionable: 0,
  },
  NI02: {
    id: 'NI02',
    name: 'General comment / suggestion / question',
    owner: 'None (not actionable)',
    policyFloor: 'low',
    isActionable: 0,
  },
  NI03: { id: 'NI03', name: 'Spam / irrelevant', owner: 'None (not actionable)', policyFloor: 'low', isActionable: 0 },
});

const CATEGORIES = Object.freeze({
  ...OFFICIAL_R5_CATEGORIES,
  // System triage state
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  // Legacy aliases for backward compatibility
  STOCK_SHORTAGE: 'STOCK_SHORTAGE',
  BILLING_DELAY: 'BILLING_DELAY',
  STAFF_BEHAVIOUR: 'STAFF_BEHAVIOUR',
  PRODUCT_QUALITY: 'PRODUCT_QUALITY',
  EQUIPMENT_FAILURE: 'EQUIPMENT_FAILURE',
  OTHER: 'OTHER',
});

const PRIORITIES = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const ISSUE_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  REOPENED: 'REOPENED',
});

const SOURCE_TYPES = Object.freeze({
  CUSTOMER_REVIEW: 'CUSTOMER_REVIEW',
  STAFF_NOTE: 'STAFF_NOTE',
  CALL_TRANSCRIPT: 'CALL_TRANSCRIPT',
  CUSTOMER_SURVEY: 'CUSTOMER_SURVEY',
  KIOSK_FEEDBACK: 'KIOSK_FEEDBACK',
  WHATSAPP_CHAT: 'WHATSAPP_CHAT',
  OTHER: 'OTHER',
});

const PROCESSING_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
  IGNORED: 'IGNORED',
  ERROR: 'ERROR',
});

const PROVENANCES = Object.freeze({
  SYNTHETIC_DEMO: 'SYNTHETIC_DEMO',
  OFFICIAL_DATASET: 'OFFICIAL_DATASET',
  MANUAL_ENTRY: 'MANUAL_ENTRY',
  TEST: 'TEST',
});

const OWNER_TEAMS = Object.freeze({
  STORE_OPS: 'STORE_OPS',
  INVENTORY: 'INVENTORY',
  BILLING_TECH: 'BILLING_TECH',
  FACILITIES_MAINTENANCE: 'FACILITIES_MAINTENANCE',
  HR_TRAINING: 'HR_TRAINING',
  CUSTOMER_SERVICE: 'CUSTOMER_SERVICE',
  QUALITY_ASSURANCE: 'QUALITY_ASSURANCE',
  UNASSIGNED: 'UNASSIGNED',
});

const AUDIT_ACTIONS = Object.freeze({
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  ASSIGNMENT_CHANGED: 'ASSIGNMENT_CHANGED',
  PRIORITY_CHANGED: 'PRIORITY_CHANGED',
  FEEDBACK_LINKED: 'FEEDBACK_LINKED',
  FEEDBACK_UNLINKED: 'FEEDBACK_UNLINKED',
  NOTE_ADDED: 'NOTE_ADDED',
});

module.exports = {
  CATEGORIES,
  OFFICIAL_R5_CATEGORIES,
  TAXONOMY_MAP,
  PRIORITIES,
  ISSUE_STATUSES,
  SOURCE_TYPES,
  PROCESSING_STATUSES,
  PROVENANCES,
  OWNER_TEAMS,
  AUDIT_ACTIONS,
  VALID_CATEGORIES: Object.values(CATEGORIES),
  VALID_PRIORITIES: Object.values(PRIORITIES),
  VALID_ISSUE_STATUSES: Object.values(ISSUE_STATUSES),
  VALID_SOURCE_TYPES: Object.values(SOURCE_TYPES),
  VALID_PROCESSING_STATUSES: Object.values(PROCESSING_STATUSES),
  VALID_PROVENANCES: Object.values(PROVENANCES),
  VALID_OWNER_TEAMS: Object.values(OWNER_TEAMS),
  VALID_AUDIT_ACTIONS: Object.values(AUDIT_ACTIONS),
};
