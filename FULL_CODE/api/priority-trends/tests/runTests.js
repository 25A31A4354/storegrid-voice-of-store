/**
 * Automated Test Suite for Priority & Trend Detection Module
 * Uses standard Node.js built-in 'assert' module (Zero external dependencies).
 * 
 * To run:
 *   node priority-trends/tests/runTests.js
 */

const assert = require('assert');
const path = require('path');
const {
  analyzeComplaints,
  calculateCounts,
  detectSpikes,
  detectRecurringComplaints,
  scoreComplaint,
  sanitizeComplaint,
  sanitizeComplaintsList,
  CATEGORIES,
  PRIORITY_LEVELS
} = require('../index');

let totalTests = 0;
let passedTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testName}`);
    console.error(`         Error: ${err.message}`);
    if (err.actual !== undefined && err.expected !== undefined) {
      console.error(`         Expected: ${JSON.stringify(err.expected)}`);
      console.error(`         Actual:   ${JSON.stringify(err.actual)}`);
    }
  }
}

console.log('\n======================================================');
console.log('  StoreGrid: Priority & Trend Detection Test Suite');
console.log('======================================================\n');

// ---------------------------------------------------------------------
// TEST GROUP 1: Empty and Edge-Case Input Handling
// ---------------------------------------------------------------------
console.log('--- Group 1: Empty & Edge-Case Input Handling ---');

runTest('Handles empty array gracefully', () => {
  const result = analyzeComplaints([]);
  assert.strictEqual(result.summary.totalComplaints, 0);
  assert.strictEqual(result.spikes.length, 0);
  assert.strictEqual(result.recurringIssues.length, 0);
  assert.strictEqual(result.prioritizedComplaints.length, 0);
  assert.strictEqual(result.metadata.status, 'EMPTY_DATASET');
});

runTest('Handles null and undefined input safely without throwing', () => {
  const resultNull = analyzeComplaints(null);
  const resultUndef = analyzeComplaints(undefined);
  assert.strictEqual(resultNull.summary.totalComplaints, 0);
  assert.strictEqual(resultUndef.summary.totalComplaints, 0);
});

runTest('Handles non-array primitive inputs safely', () => {
  const resultString = analyzeComplaints("not an array");
  const resultNumber = analyzeComplaints(12345);
  assert.strictEqual(resultString.summary.totalComplaints, 0);
  assert.strictEqual(resultNumber.summary.totalComplaints, 0);
  assert.ok(resultString.validationWarnings.length > 0);
});

// ---------------------------------------------------------------------
// TEST GROUP 2: Data Sanitization & Missing/Invalid Fields
// ---------------------------------------------------------------------
console.log('\n--- Group 2: Sanitization & Resilient Field Handling ---');

runTest('Normalizes invalid category string to NEEDS_REVIEW', () => {
  const raw = {
    id: 'TEST-1',
    storeId: 'STORE-01',
    category: 'INVALID_CATEGORY_XYZ',
    createdAt: '2026-10-17T10:00:00Z'
  };
  const sanitized = sanitizeComplaint(raw);
  assert.strictEqual(sanitized.complaint.category, CATEGORIES.NEEDS_REVIEW);
  assert.ok(sanitized.warnings.some(w => w.includes('NEEDS_REVIEW')));
});

runTest('Assigns safe fallback when ID or storeId is missing', () => {
  const raw = {
    category: 'STOCK_SHORTAGE',
    createdAt: '2026-10-17T10:00:00Z'
  };
  const sanitized = sanitizeComplaint(raw, 5);
  assert.ok(sanitized.complaint.id.startsWith('CMP-GEN-'));
  assert.strictEqual(sanitized.complaint.storeId, 'UNKNOWN_STORE');
});

runTest('Recovers from unparseable date strings with safe fallback', () => {
  const raw = {
    id: 'TEST-DATE',
    storeId: 'STORE-01',
    category: 'OTHER',
    createdAt: 'this-is-not-a-date'
  };
  const sanitized = sanitizeComplaint(raw);
  assert.ok(sanitized.complaint.createdAt instanceof Date);
  assert.ok(!isNaN(sanitized.complaint.createdAt.getTime()));
  assert.ok(sanitized.warnings.some(w => w.includes('invalid createdAt')));
});

// ---------------------------------------------------------------------
// TEST GROUP 3: Store-wise & Category-wise Counts
// ---------------------------------------------------------------------
console.log('\n--- Group 3: Store & Category Aggregate Counts ---');

runTest('Calculates accurate store-wise and category-wise totals', () => {
  const testList = [
    { storeId: 'STORE-A', category: 'EQUIPMENT_FAILURE', status: 'OPEN' },
    { storeId: 'STORE-A', category: 'BILLING_DELAY', status: 'OPEN' },
    { storeId: 'STORE-B', category: 'EQUIPMENT_FAILURE', status: 'RESOLVED' },
    { storeId: 'STORE-B', category: 'STOCK_SHORTAGE', status: 'OPEN' },
    { storeId: 'STORE-B', category: 'STOCK_SHORTAGE', status: 'OPEN' }
  ];
  const { complaints } = sanitizeComplaintsList(testList);
  const counts = calculateCounts(complaints);

  assert.strictEqual(counts.totalComplaints, 5);
  assert.strictEqual(counts.storeWiseCounts['STORE-A'], 2);
  assert.strictEqual(counts.storeWiseCounts['STORE-B'], 3);
  assert.strictEqual(counts.categoryWiseCounts.EQUIPMENT_FAILURE, 2);
  assert.strictEqual(counts.categoryWiseCounts.BILLING_DELAY, 1);
  assert.strictEqual(counts.categoryWiseCounts.STOCK_SHORTAGE, 2);
  // Ensure unencountered agreed categories still exist with count 0
  assert.strictEqual(counts.categoryWiseCounts.STAFF_BEHAVIOUR, 0);
  assert.strictEqual(counts.categoryWiseCounts.PRODUCT_QUALITY, 0);
  assert.strictEqual(counts.categoryWiseCounts.OTHER, 0);
  assert.strictEqual(counts.categoryWiseCounts.NEEDS_REVIEW, 0);
});

// ---------------------------------------------------------------------
// TEST GROUP 4: Sudden Complaint Spike Detection
// ---------------------------------------------------------------------
console.log('\n--- Group 4: Sudden Complaint Spike Detection ---');

runTest('Detects sudden volume surge compared to previous window', () => {
  const refTime = new Date('2026-10-17T12:00:00Z');

  // Baseline window (24h to 48h ago): 1 complaint
  // Recent window (0h to 24h ago): 4 complaints (4x increase >= 2.0x threshold, count >= 3)
  const testData = [
    // Previous window
    {
      id: 'PREV-1',
      storeId: 'STORE-01',
      category: 'BILLING_DELAY',
      createdAt: '2026-10-15T15:00:00Z'
    },
    // Recent window (4 complaints)
    {
      id: 'REC-1',
      storeId: 'STORE-01',
      category: 'BILLING_DELAY',
      createdAt: '2026-10-16T15:00:00Z'
    },
    {
      id: 'REC-2',
      storeId: 'STORE-01',
      category: 'BILLING_DELAY',
      createdAt: '2026-10-16T18:00:00Z'
    },
    {
      id: 'REC-3',
      storeId: 'STORE-01',
      category: 'BILLING_DELAY',
      createdAt: '2026-10-17T09:00:00Z'
    },
    {
      id: 'REC-4',
      storeId: 'STORE-01',
      category: 'BILLING_DELAY',
      createdAt: '2026-10-17T11:00:00Z'
    }
  ];

  const { complaints } = sanitizeComplaintsList(testData);
  const result = detectSpikes(complaints, { referenceTime: refTime, windowHours: 24 });

  assert.strictEqual(result.spikes.length, 1);
  const spike = result.spikes[0];
  assert.strictEqual(spike.storeId, 'STORE-01');
  assert.strictEqual(spike.category, 'BILLING_DELAY');
  assert.strictEqual(spike.recentCount, 4);
  assert.strictEqual(spike.previousCount, 1);
  assert.strictEqual(spike.ratio, 4.0);
  assert.ok(spike.alertMessage.includes('4x spike'));
});

runTest('Does not falsely flag minor normal volume as spike', () => {
  const refTime = new Date('2026-10-17T12:00:00Z');
  // 1 complaint previous, 1 complaint recent -> No spike
  const testData = [
    { id: '1', storeId: 'STORE-01', category: 'OTHER', createdAt: '2026-10-15T15:00:00Z' },
    { id: '2', storeId: 'STORE-01', category: 'OTHER', createdAt: '2026-10-16T15:00:00Z' }
  ];
  const { complaints } = sanitizeComplaintsList(testData);
  const result = detectSpikes(complaints, { referenceTime: refTime, windowHours: 24 });
  assert.strictEqual(result.spikes.length, 0);
});

// ---------------------------------------------------------------------
// TEST GROUP 5: Recurring Complaint Detection & Evidence Rules
// ---------------------------------------------------------------------
console.log('\n--- Group 5: Recurring Complaint Detection ---');

runTest('Detects recurring issue when asset ID matches resolved prior complaint', () => {
  const testData = [
    // Prior complaint resolved on Oct 11
    {
      id: 'PRIOR-01',
      storeId: 'STORE-01',
      category: 'EQUIPMENT_FAILURE',
      status: 'RESOLVED',
      createdAt: '2026-10-10T10:00:00Z',
      resolvedAt: '2026-10-11T12:00:00Z',
      itemOrAssetId: 'FREEZER-01',
      subject: 'Freezer temperature rise'
    },
    // New complaint created on Oct 15 (4 days after resolution, same asset)
    {
      id: 'NEW-01',
      storeId: 'STORE-01',
      category: 'EQUIPMENT_FAILURE',
      status: 'OPEN',
      createdAt: '2026-10-15T10:00:00Z',
      itemOrAssetId: 'FREEZER-01',
      subject: 'Freezer temperature rise again'
    }
  ];

  const { complaints } = sanitizeComplaintsList(testData);
  const recurrenceMap = detectRecurringComplaints(complaints, { recurrenceWindowDays: 14 });
  const newRecurrence = recurrenceMap.get('NEW-01');

  assert.strictEqual(newRecurrence.isRecurring, true);
  assert.strictEqual(newRecurrence.matchingRule, 'EXACT_ASSET_MATCH');
  assert.strictEqual(newRecurrence.previousComplaintId, 'PRIOR-01');
  assert.strictEqual(newRecurrence.daysSinceResolution, 3.9);
});

runTest('Does NOT flag as recurring if complaints reference DIFFERENT assets', () => {
  const testData = [
    {
      id: 'PRIOR-02',
      storeId: 'STORE-01',
      category: 'EQUIPMENT_FAILURE',
      status: 'RESOLVED',
      createdAt: '2026-10-10T10:00:00Z',
      resolvedAt: '2026-10-11T12:00:00Z',
      itemOrAssetId: 'POS-01',
      subject: 'POS 01 offline'
    },
    {
      id: 'NEW-02',
      storeId: 'STORE-01',
      category: 'EQUIPMENT_FAILURE',
      status: 'OPEN',
      createdAt: '2026-10-15T10:00:00Z',
      itemOrAssetId: 'POS-02', // Different POS terminal!
      subject: 'POS 02 offline'
    }
  ];

  const { complaints } = sanitizeComplaintsList(testData);
  const recurrenceMap = detectRecurringComplaints(complaints, { recurrenceWindowDays: 14 });
  const newRecurrence = recurrenceMap.get('NEW-02');

  assert.strictEqual(newRecurrence.isRecurring, false);
});

runTest('Does NOT flag as recurring if new complaint occurs AFTER window expired', () => {
  const testData = [
    {
      id: 'OLD-01',
      storeId: 'STORE-01',
      category: 'EQUIPMENT_FAILURE',
      status: 'RESOLVED',
      createdAt: '2026-08-01T10:00:00Z',
      resolvedAt: '2026-08-02T12:00:00Z',
      itemOrAssetId: 'POS-01',
      subject: 'Touchscreen broken'
    },
    {
      id: 'LATER-01',
      storeId: 'STORE-01',
      category: 'EQUIPMENT_FAILURE',
      status: 'OPEN',
      createdAt: '2026-10-17T10:00:00Z', // 76 days later, beyond 14-day window
      itemOrAssetId: 'POS-01',
      subject: 'Touchscreen broken'
    }
  ];

  const { complaints } = sanitizeComplaintsList(testData);
  const recurrenceMap = detectRecurringComplaints(complaints, { recurrenceWindowDays: 14 });
  const recurrence = recurrenceMap.get('LATER-01');

  assert.strictEqual(recurrence.isRecurring, false);
});

// ---------------------------------------------------------------------
// TEST GROUP 6: Explainable Priority Scoring
// ---------------------------------------------------------------------
console.log('\n--- Group 6: Explainable Priority Scoring ---');

runTest('Calculates score and returns transparent explanations array', () => {
  const complaint = {
    id: 'CMP-HIGH-01',
    storeId: 'STORE-01',
    category: 'EQUIPMENT_FAILURE', // base +35
    status: 'OPEN',
    createdAt: new Date('2026-10-14T10:00:00Z'), // > 48h aging +10
    subject: 'Emergency generator smoke detected', // keyword 'smoke' +10
    details: 'Smoke coming from back unit.'
  };

  const context = {
    recurrenceInfo: { isRecurring: true, previousComplaintId: 'CMP-OLD', matchingRule: 'EXACT_ASSET_MATCH' }, // recurring +25
    spikeLookup: { 'STORE-01:::EQUIPMENT_FAILURE': { alertMessage: 'Active 3x spike' } }, // spike +20
    referenceTime: new Date('2026-10-17T12:00:00Z')
  };

  const result = scoreComplaint(complaint, context);

  // Expected points: 35 (base) + 25 (recurring) + 20 (spike) + 10 (aging > 48h) + 10 (keyword smoke) = 100
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.level, PRIORITY_LEVELS.CRITICAL);
  assert.ok(Array.isArray(result.explanations));
  assert.strictEqual(result.explanations.length, 5);
  assert.ok(result.explanations.some(e => e.includes('EQUIPMENT_FAILURE')));
  assert.ok(result.explanations.some(e => e.includes('Recurring issue')));
  assert.ok(result.explanations.some(e => e.includes('Active complaint spike')));
  assert.ok(result.explanations.some(e => e.includes('Aging complaint')));
  assert.ok(result.explanations.some(e => e.includes('smoke')));
});

runTest('Scores a low-impact routine complaint correctly as LOW', () => {
  const complaint = {
    id: 'CMP-LOW-01',
    storeId: 'STORE-02',
    category: 'OTHER', // base +10
    status: 'OPEN',
    createdAt: new Date('2026-10-17T11:00:00Z'), // recent (no aging bonus)
    subject: 'Request for shopping cart disinfectant wipes refill',
    details: 'Wipes dispenser empty.'
  };

  const result = scoreComplaint(complaint, {
    recurrenceInfo: { isRecurring: false },
    spikeLookup: {},
    referenceTime: new Date('2026-10-17T12:00:00Z')
  });

  assert.strictEqual(result.score, 10);
  assert.strictEqual(result.level, PRIORITY_LEVELS.LOW);
});

// ---------------------------------------------------------------------
// TEST GROUP 7: End-to-End Analytics Pipeline with Synthetic Dataset
// ---------------------------------------------------------------------
console.log('\n--- Group 7: End-to-End Pipeline on Synthetic Dataset ---');

runTest('Processes synthetic sample dataset and produces complete dashboard JSON', () => {
  const sampleJson = require('../sampleData.json');
  const result = analyzeComplaints(sampleJson.complaints, {
    referenceTime: sampleJson.metadata.simulatedReferenceTime
  });

  assert.strictEqual(result.metadata.status, 'SUCCESS');
  assert.strictEqual(result.summary.totalComplaints, sampleJson.complaints.length);
  assert.ok(result.summary.criticalPriorityCount >= 1, 'At least 1 critical complaint');
  assert.ok(result.spikes.length >= 1, 'At least 1 spike detected in BILLING_DELAY');
  assert.ok(result.recurringIssues.length >= 1, 'At least 1 recurring complaint detected');
  assert.ok(result.dashboardAlerts.length >= 1, 'Dashboard alerts generated');

  // Verify prioritizedComplaints is sorted descending by score
  for (let i = 0; i < result.prioritizedComplaints.length - 1; i++) {
    assert.ok(
      result.prioritizedComplaints[i].priority.score >= result.prioritizedComplaints[i + 1].priority.score,
      'Complaints must be sorted by priority score descending'
    );
  }

  // Verify resilience with invalid category record (CMP-1017)
  const invalidRecord = result.prioritizedComplaints.find(c => c.id === 'CMP-1017');
  assert.ok(invalidRecord, 'Sanitized complaint CMP-1017 should exist');
  assert.strictEqual(invalidRecord.category, CATEGORIES.NEEDS_REVIEW);
});

runTest('Scans both subject and details fields for high-impact keywords', () => {
  // Keyword 'smoke' is in details, subject has no keywords
  const complaintWithKeywordInDetails = {
    id: 'CMP-KW-01',
    storeId: 'STORE-01',
    category: 'EQUIPMENT_FAILURE',
    status: 'OPEN',
    createdAt: new Date('2026-10-17T11:00:00Z'),
    subject: 'Power supply unit malfunction',
    details: 'Heavy smoke observed rising from the adapter cable.'
  };

  const result = scoreComplaint(complaintWithKeywordInDetails, {
    recurrenceInfo: { isRecurring: false },
    spikeLookup: {},
    referenceTime: new Date('2026-10-17T12:00:00Z')
  });

  assert.ok(result.explanations.some(e => e.includes('smoke')));
  assert.strictEqual(result.factorBreakdown.keywordBonus, 10);
});

runTest('Separates unresolved actionable complaints from full prioritized complaints list', () => {
  const sampleJson = require('../sampleData.json');
  const result = analyzeComplaints(sampleJson.complaints, {
    referenceTime: sampleJson.metadata.simulatedReferenceTime
  });

  // Check unresolvedPrioritizedComplaints exists
  assert.ok(Array.isArray(result.unresolvedPrioritizedComplaints));
  
  // None of the items in unresolvedPrioritizedComplaints should be RESOLVED or CLOSED
  result.unresolvedPrioritizedComplaints.forEach(c => {
    assert.notStrictEqual(c.status, 'RESOLVED');
    assert.notStrictEqual(c.status, 'CLOSED');
  });

  // Verify that resolved complaint CMP-1001 is excluded from unresolvedPrioritizedComplaints
  const inActionQueue = result.unresolvedPrioritizedComplaints.some(c => c.id === 'CMP-1001');
  assert.strictEqual(inActionQueue, false, 'Resolved complaint CMP-1001 should not be in unresolved queue');

  // But CMP-1001 MUST still exist in prioritizedComplaints for auditability
  const inFullList = result.prioritizedComplaints.some(c => c.id === 'CMP-1001');
  assert.strictEqual(inFullList, true, 'CMP-1001 must still exist in prioritizedComplaints for historical audit');
});

// ---------------------------------------------------------------------
// TEST GROUP 8: Integration Aliases & Wrapper Object Resilience
// ---------------------------------------------------------------------
console.log('\n--- Group 8: Integration Aliases & Wrapper Objects ---');

runTest('Handles snake_case PostgreSQL database fields safely', () => {
  const pgRow = {
    complaint_id: 'PG-101',
    store_id: 'store-05',
    category: 'EQUIPMENT_FAILURE',
    status: 'resolved',
    created_at: '2026-10-15T09:00:00Z',
    resolved_at: '2026-10-15T11:00:00Z',
    item_id: 'pos-lane-3'
  };

  const { complaint, isValid } = sanitizeComplaint(pgRow);
  assert.strictEqual(isValid, true);
  assert.strictEqual(complaint.id, 'PG-101');
  assert.strictEqual(complaint.storeId, 'STORE-05');
  assert.strictEqual(complaint.status, 'RESOLVED');
  assert.strictEqual(complaint.itemOrAssetId, 'POS-LANE-3');
  assert.ok(complaint.createdAt instanceof Date);
  assert.ok(complaint.resolvedAt instanceof Date);
});

runTest('Handles NLP classification fields and alternate text properties', () => {
  const nlpRecord = {
    id: 'NLP-202',
    storeId: 'STORE-02',
    predicted_category: 'BILLING_DELAY',
    title: 'Slow checkout queue',
    description: 'Payment gateway timeout caused 15 minute delay.',
    asset_id: 'GATEWAY-01'
  };

  const { complaint, isValid } = sanitizeComplaint(nlpRecord);
  assert.strictEqual(isValid, true);
  assert.strictEqual(complaint.category, 'BILLING_DELAY');
  assert.strictEqual(complaint.subject, 'Slow checkout queue');
  assert.strictEqual(complaint.details, 'Payment gateway timeout caused 15 minute delay.');
  assert.strictEqual(complaint.itemOrAssetId, 'GATEWAY-01');
});

runTest('Accepts wrapper objects containing complaints or data arrays', () => {
  const wrappedComplaints = {
    metadata: { simulated: true },
    complaints: [
      { id: 'W-1', storeId: 'STORE-01', category: 'STOCK_SHORTAGE' },
      { id: 'W-2', storeId: 'STORE-01', category: 'BILLING_DELAY' }
    ]
  };

  const result1 = analyzeComplaints(wrappedComplaints);
  assert.strictEqual(result1.summary.totalComplaints, 2);
  assert.strictEqual(result1.metadata.totalInput, 2);

  const wrappedData = {
    data: [
      { id: 'D-1', store_id: 'STORE-02', category: 'OTHER' }
    ]
  };

  const result2 = analyzeComplaints(wrappedData);
  assert.strictEqual(result2.summary.totalComplaints, 1);
  assert.strictEqual(result2.metadata.totalInput, 1);
});

runTest('Safely handles invalid wrapper values without throwing', () => {
  const invalidWrapper1 = { complaints: "not an array" };
  const invalidWrapper2 = { complaints: null };
  const invalidWrapper3 = { data: 98765 };

  const res1 = analyzeComplaints(invalidWrapper1);
  const res2 = analyzeComplaints(invalidWrapper2);
  const res3 = analyzeComplaints(invalidWrapper3);

  assert.strictEqual(res1.summary.totalComplaints, 0);
  assert.strictEqual(res2.summary.totalComplaints, 0);
  assert.strictEqual(res3.summary.totalComplaints, 0);
  assert.ok(res1.validationWarnings.length > 0);
});

console.log('\n======================================================');
console.log(`  Test Results: ${passedTests}/${totalTests} Passed (${totalTests - passedTests} Failed)`);
console.log('======================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
