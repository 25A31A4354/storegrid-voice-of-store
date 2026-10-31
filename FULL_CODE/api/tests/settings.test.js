const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../src/app');
const db = require('../src/db');
const { evaluatePriority } = require('../src/services/feedback.service');
const { PRIORITIES, CATEGORIES, PROVENANCES } = require('../src/constants/enums');

let server;
let baseUrl;

function getBaseUrl() {
  return baseUrl;
}

describe('Settings & Tools Functional Integration Tests', () => {
  before(async () => {
    await db.initDb({ inMemory: true });
    // Ensure test store exists
    await db.query(
      `INSERT INTO stores (id, code, name, city, region, created_at, updated_at)
       VALUES ('test-store-id-01', 'TEST-STR-01', 'Test Store Begumpet', 'Hyderabad', 'South', datetime('now'), datetime('now'))
       ON CONFLICT(code) DO NOTHING;`
    );

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('GET /api/settings returns sensible defaults and threshold ratio', async () => {
    const res = await fetch(`${getBaseUrl()}/api/settings`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.confidenceThreshold, 65);
    assert.equal(body.data.confidenceThresholdRatio, 0.65);
    assert.equal(body.data.autoFlagCritical, true);
    assert.equal(body.data.multilingualNormalization, true);
    assert.ok(Array.isArray(body.data.allowedThresholds));
    assert.deepEqual(body.data.allowedThresholds, [40, 65, 90]);
  });

  test('PATCH /api/settings rejects invalid threshold values outside 40-90 range', async () => {
    const res = await fetch(`${getBaseUrl()}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confidenceThreshold: 25 }),
    });
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.message.includes('40% and 90%'));
  });

  test('PATCH /api/settings persists updated threshold (40%, 65%, 90%) and toggles', async () => {
    // 1. Update to 90%
    let patchRes = await fetch(`${getBaseUrl()}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confidenceThreshold: 90,
        autoFlagCritical: false,
        multilingualNormalization: false,
      }),
    });
    assert.equal(patchRes.status, 200);
    let body = await patchRes.json();
    assert.equal(body.data.confidenceThreshold, 90);
    assert.equal(body.data.confidenceThresholdRatio, 0.9);
    assert.equal(body.data.autoFlagCritical, false);
    assert.equal(body.data.multilingualNormalization, false);

    // Verify GET reflects persisted values
    let getRes = await fetch(`${getBaseUrl()}/api/settings`);
    body = await getRes.json();
    assert.equal(body.data.confidenceThreshold, 90);
    assert.equal(body.data.autoFlagCritical, false);

    // Reset back to standard 65% with autoFlagCritical: true
    await fetch(`${getBaseUrl()}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confidenceThreshold: 65,
        autoFlagCritical: true,
        multilingualNormalization: true,
      }),
    });
  });

  test('Routing below configured threshold: 90% threshold routes 0.70 match to NEEDS_REVIEW', async () => {
    // Set threshold to 90%
    await fetch(`${getBaseUrl()}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confidenceThreshold: 90 }),
    });

    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'Aisle 3 items unavailable today.',
        rating: 3,
        sourceType: 'CUSTOMER_REVIEW',
        provenance: 'TEST',
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();

    // Baseline heuristic confidence is 0.70, which is below 0.90 threshold -> Must route to NEEDS_REVIEW
    assert.equal(body.data.detectedCategory, CATEGORIES.NEEDS_REVIEW);
    assert.equal(body.data.needsReview, true);
    assert.equal(body.data.metadata.thresholdApplied, 0.9);

    // Restore to 65% threshold
    await fetch(`${getBaseUrl()}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confidenceThreshold: 65 }),
    });
  });

  test('Priority Escalation Rule: CRITICAL for recognized hazards vs HIGH/MEDIUM for non-hazardous equipment', () => {
    // 1. Recognized physical and safety hazards -> CRITICAL
    assert.equal(
      evaluatePriority({
        text: 'Live sparks coming from exposed wire near dairy section',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: true,
      }),
      PRIORITIES.CRITICAL
    );

    assert.equal(
      evaluatePriority({
        text: 'Lift stuck between ground and first floor with 3 people trapped inside',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: true,
      }),
      PRIORITIES.CRITICAL
    );

    assert.equal(
      evaluatePriority({
        text: 'Walk-in freezer broken down and ice cream melted completely',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: true,
      }),
      PRIORITIES.CRITICAL
    );

    assert.equal(
      evaluatePriority({
        text: 'Heavy water leak from ceiling created slippery floor hazard',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: true,
      }),
      PRIORITIES.CRITICAL
    );

    // 2. Non-hazardous equipment complaints -> Must NOT be classified as CRITICAL!
    assert.equal(
      evaluatePriority({
        text: 'Counter 2 barcode scanner is not working properly today',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: true,
      }),
      PRIORITIES.HIGH
    );

    assert.equal(
      evaluatePriority({
        text: 'Receipt printer jammed at checkout desk',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: true,
      }),
      PRIORITIES.HIGH
    );

    assert.equal(
      evaluatePriority({
        text: 'Vegetable weighing scale display is glitching',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: true,
      }),
      PRIORITIES.HIGH
    );

    // 3. Unrelated feedback examples
    assert.equal(
      evaluatePriority({
        text: 'Long queue at billing counter waited 20 minutes',
        category: CATEGORIES.BILLING_DELAY,
        autoFlagCritical: true,
      }),
      PRIORITIES.HIGH
    );

    assert.equal(
      evaluatePriority({
        text: 'Store was clean and staff was polite',
        category: CATEGORIES.STAFF_BEHAVIOUR,
        rating: 5,
        autoFlagCritical: true,
      }),
      PRIORITIES.LOW
    );

    assert.equal(
      evaluatePriority({
        text: 'Cashier was dismissive and unhelpful',
        category: CATEGORIES.STAFF_BEHAVIOUR,
        rating: 2,
        autoFlagCritical: true,
      }),
      PRIORITIES.MEDIUM
    );

    // 4. When autoFlagCritical is turned off
    assert.equal(
      evaluatePriority({
        text: 'Live sparks coming from electrical panel',
        category: CATEGORIES.EQUIPMENT_FAILURE,
        autoFlagCritical: false,
      }),
      PRIORITIES.HIGH // Not escalated to CRITICAL when feature disabled
    );
  });

  test('Safe Demo Reset: resets synthetic records while preserving manual and imported records', async () => {
    // 1. Inspect provenance counts before
    const statsRes = await fetch(`${getBaseUrl()}/api/settings/stats`);
    assert.equal(statsRes.status, 200);
    const statsBody = await statsRes.json();
    assert.ok(statsBody.data.syntheticDemo !== undefined);

    // 2. Insert one manual entry and one official dataset entry to ensure they are NOT deleted
    const manualInsertSql = `
      INSERT INTO feedback (id, store_id, text, source_type, timestamp, rating, language, detected_category, processing_status, provenance, created_at, updated_at)
      VALUES ($1, (SELECT id FROM stores LIMIT 1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
    `;
    const now = new Date().toISOString();
    await db.query(manualInsertSql, [
      'manual-record-preserve-test',
      'Preserve this manual customer feedback item',
      'CUSTOMER_REVIEW',
      now,
      5,
      'en',
      CATEGORIES.PRODUCT_QUALITY,
      'PROCESSED',
      PROVENANCES.MANUAL_ENTRY,
      now,
      now,
    ]);

    await db.query(manualInsertSql, [
      'imported-record-preserve-test',
      'Preserve this imported CSV feedback item',
      'CUSTOMER_REVIEW',
      now,
      4,
      'en',
      CATEGORIES.BILLING_DELAY,
      'PROCESSED',
      PROVENANCES.OFFICIAL_DATASET,
      now,
      now,
    ]);

    // 3. Trigger Reset Demo Workspace
    const resetRes = await fetch(`${getBaseUrl()}/api/settings/reset-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.equal(resetBody.success, true);

    // 4. Verify manual and imported records survived
    const manualCheck = await db.query('SELECT id FROM feedback WHERE id = $1', ['manual-record-preserve-test']);
    assert.equal(manualCheck.rows.length, 1, 'Manual entry MUST be preserved during demo reset');

    const importedCheck = await db.query('SELECT id FROM feedback WHERE id = $1', ['imported-record-preserve-test']);
    assert.equal(importedCheck.rows.length, 1, 'Imported dataset MUST be preserved during demo reset');

    // 5. Verify stats endpoint accurately reports counts
    const updatedStatsRes = await fetch(`${getBaseUrl()}/api/settings/stats`);
    const updatedStatsBody = await updatedStatsRes.json();
    assert.ok(updatedStatsBody.data.manualEntry >= 1);
    assert.ok(updatedStatsBody.data.officialDataset >= 1);
  });
});
