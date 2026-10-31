/**
 * Interactive Demonstration Script for Priority & Trend Detection Module
 * StoreGrid Hackathon Project
 * 
 * To run:
 *   node priority-trends/demo.js
 */

const { analyzeComplaints } = require('./index');
const sampleData = require('./sampleData.json');

console.log('\n================================================================');
console.log('  STOREGRID: Priority & Trend Detection Analytics Demonstration');
console.log('  (Using Synthetic Fictional Test Dataset)');
console.log('================================================================\n');

// Run analytics pipeline with synthetic dataset reference time
const results = analyzeComplaints(sampleData.complaints, {
  referenceTime: sampleData.metadata.simulatedReferenceTime,
  windowHours: 24,
  spikeRatioThreshold: 2.0,
  minSpikeVolume: 3,
  recurrenceWindowDays: 14
});

// 1. Executive Summary KPIs
console.log('--- 1. DASHBOARD KPI METRICS ---');
console.log(`Total Complaints Analyzed : ${results.summary.totalComplaints}`);
console.log(`Open Complaints           : ${results.summary.openComplaints}`);
console.log(`In-Progress Complaints    : ${results.summary.inProgressComplaints}`);
console.log(`Resolved / Closed         : ${results.summary.resolvedComplaints}`);
console.log(`CRITICAL Priority Issues  : ${results.summary.criticalPriorityCount}`);
console.log(`HIGH Priority Issues      : ${results.summary.highPriorityCount}`);
console.log(`Active Spikes Detected    : ${results.summary.activeSpikesCount}`);
console.log(`Recurring Issues Detected : ${results.summary.recurringComplaintsCount}`);

// 2. Store-wise Breakdown
console.log('\n--- 2. STORE-WISE COMPLAINT COUNTS ---');
for (const [storeId, count] of Object.entries(results.storeWiseCounts)) {
  console.log(`  * ${storeId.padEnd(12)} : ${count} complaints`);
}

// 3. Category-wise Breakdown
console.log('\n--- 3. CATEGORY-WISE COMPLAINT COUNTS ---');
for (const [category, count] of Object.entries(results.categoryWiseCounts)) {
  const bar = '■'.repeat(count);
  console.log(`  * ${category.padEnd(20)} : ${String(count).padStart(2)} ${bar}`);
}

// 4. Sudden Spikes Detected
console.log('\n--- 4. SUDDEN SPIKE ALERTS (Last 24h vs Previous 24h) ---');
if (results.spikes.length === 0) {
  console.log('  No sudden spikes detected.');
} else {
  results.spikes.forEach((spike, idx) => {
    console.log(`  [ALERT #${idx + 1}] Severity: ${spike.severity}`);
    console.log(`    Message       : ${spike.alertMessage}`);
    console.log(`    Store / Cat   : ${spike.storeId} | ${spike.category}`);
    console.log(`    Recent Volume : ${spike.recentCount} complaints (Previous: ${spike.previousCount})`);
    console.log(`    Growth Factor : ${spike.ratio}x`);
  });
}

// 5. Recurring Complaints Detected
console.log('\n--- 5. RECURRING ISSUE DETECTION (After Resolution) ---');
if (results.recurringIssues.length === 0) {
  console.log('  No recurring complaints found.');
} else {
  results.recurringIssues.forEach((issue, idx) => {
    console.log(`  [RECURRENCE #${idx + 1}] Complaint: ${issue.complaintId} at ${issue.storeId}`);
    console.log(`    Subject          : "${issue.subject}"`);
    console.log(`    Evidence Match   : ${issue.evidence}`);
    console.log(`    Prior Incident   : ${issue.previousComplaintId}`);
    console.log(`    Days Since Solved: ${issue.daysSinceResolution} days`);
  });
}

// 6. Top Prioritized Issues with Transparent Explanations (Action Queue)
console.log('\n--- 6. TOP UNRESOLVED COMPLAINTS (Operational Action Queue) ---');
console.log('  (Actionable issues only; resolved complaints are retained in prioritizedComplaints for audit)');
const actionableIssues = results.unresolvedPrioritizedComplaints || results.prioritizedComplaints.filter(c => c.status !== 'RESOLVED' && c.status !== 'CLOSED');
actionableIssues.slice(0, 4).forEach((item, idx) => {
  console.log(`\n  #${idx + 1} [${item.priority.level}] Score: ${item.priority.score}/100 - Complaint ${item.id}`);
  console.log(`     Store: ${item.storeId} | Category: ${item.category} | Status: ${item.status}`);
  console.log(`     Subject: "${item.subject}"`);
  if (item.details) console.log(`     Details: "${item.details}"`);
  if (item.itemOrAssetId) console.log(`     Asset/Item ID: ${item.itemOrAssetId}`);
  console.log('     Score Reasons:');
  item.priority.explanations.forEach(exp => console.log(`       - ${exp}`));
});

// 7. Validation Resilience Check
console.log('\n--- 7. DATA SANITIZATION & RESILIENCE ---');
if (results.validationWarnings.length > 0) {
  console.log(`  Captured ${results.validationWarnings.length} validation warning(s) handled gracefully:`);
  results.validationWarnings.forEach(w => console.log(`    [NOTICE] ${w}`));
} else {
  console.log('  All incoming records were perfectly valid.');
}

console.log('\n================================================================');
console.log('  Demonstration Completed Successfully.');
console.log('================================================================\n');
