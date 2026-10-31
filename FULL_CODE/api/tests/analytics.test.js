const test = require('node:test');
const assert = require('node:assert/strict');
const storeService = require('../src/services/store.service');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');

test.describe('Dashboard & Analytics API Endpoints', () => {
  test.before(async () => {
    await setupTestServer();

    // Provision stores for recurrence risk level tests
    await storeService.findOrCreateStore({
      storeIdOrCode: 'TEST-STR-02',
      defaultName: 'Test Store Beta',
      region: 'Test Region',
      city: 'Test City',
    });
    await storeService.findOrCreateStore({
      storeIdOrCode: 'TEST-STR-03',
      defaultName: 'Test Store Gamma',
      region: 'Test Region',
      city: 'Test City',
    });
    await storeService.findOrCreateStore({
      storeIdOrCode: 'TEST-STR-04',
      defaultName: 'Test Store Delta',
      region: 'Test Region',
      city: 'Test City',
    });

    // Create 4 feedbacks at TEST-STR-01 across successive minutes on today's date (recurrence = 4, HIGH)
    const now = Date.now();
    for (let i = 1; i <= 4; i++) {
      const ts = new Date(now + i * 60000).toISOString();
      await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-01',
          text: `Freezer unit breakdown leaking water incident ${i}`,
          category: 'EQUIPMENT_FAILURE',
          timestamp: ts,
          provenance: 'TEST',
        }),
      });
    }

    // Create 6 feedbacks at TEST-STR-03 across successive minutes (recurrence = 6, CRITICAL)
    for (let i = 1; i <= 6; i++) {
      const ts = new Date(now + i * 60000).toISOString();
      await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-03',
          text: `Card payment checkout terminal crash event ${i}`,
          category: 'BILLING_DELAY',
          timestamp: ts,
          provenance: 'TEST',
        }),
      });
    }

    // Create 2 feedbacks at TEST-STR-04 across successive minutes (recurrence = 2, MEDIUM)
    for (let i = 1; i <= 2; i++) {
      const ts = new Date(now + i * 60000).toISOString();
      await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-04',
          text: `Milk carton out of stock in aisle ${i}`,
          category: 'STOCK_SHORTAGE',
          timestamp: ts,
          provenance: 'TEST',
        }),
      });
    }

    // Create an isolated complaint at TEST-STR-02 that gets duplicated (exact same text & timestamp)
    // to simulate accidental re-seeding / duplicate webhook events
    const isolatedTimestamp = new Date(now).toISOString();
    for (let dup = 0; dup < 2; dup++) {
      await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-02',
          text: 'Isolated one-off complaint with customer arguing over 5 rupees coin',
          category: 'STAFF_BEHAVIOUR',
          timestamp: isolatedTimestamp,
          provenance: 'TEST',
        }),
      });
    }

    // Create a critical issue
    await fetch(`${getBaseUrl()}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        title: 'Critical Freezer Compressor Breakdown',
        category: 'EQUIPMENT_FAILURE',
        priority: 'CRITICAL',
        status: 'OPEN',
        ownerTeam: 'FACILITIES_MAINTENANCE',
      }),
    });
  });

  test.after(async () => {
    await teardownTestServer();
  });

  test('GET /api/dashboard/summary should return dashboard metrics', async () => {
    const res = await fetch(`${getBaseUrl()}/api/dashboard/summary`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.overview);
    assert.ok(body.data.overview.totalFeedback >= 4);
    assert.ok(body.data.overview.totalIssues >= 1);
    assert.ok(body.data.overview.criticalIssues >= 1);

    // Breakdown structure
    assert.ok(body.data.breakdown.byStatus);
    assert.ok(body.data.breakdown.byCategory);
    assert.ok('OTHER' in body.data.breakdown.byCategory);
    assert.ok('NEEDS_REVIEW' in body.data.breakdown.byCategory);
    assert.ok(body.data.breakdown.byPriority);
    assert.ok(body.data.breakdown.bySource);
    assert.ok(body.data.metadata.nlpService);

    // Recent urgent issues
    assert.ok(Array.isArray(body.data.recentUrgentIssues));
    assert.ok(body.data.recentUrgentIssues.length >= 1);
    assert.equal(body.data.recentUrgentIssues[0].priority, 'CRITICAL');
  });

  test('GET /api/analytics/trends should detect volume trends and spikes', async () => {
    const res = await fetch(`${getBaseUrl()}/api/analytics/trends?timeframe=30d`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.engineStatus, 'BASELINE_ALGORITHMIC');
    assert.ok(Array.isArray(body.data.timeline));
    assert.ok(Array.isArray(body.data.detectedSpikes));
    assert.ok(Array.isArray(body.data.recurringPatterns));

    // The 4 complaints at TEST-STR-01 today should trigger a spike alert
    const testSpike = body.data.detectedSpikes.find((s) => s.storeCode === 'TEST-STR-01');
    assert.ok(testSpike);
    assert.equal(testSpike.dominantCategory, 'EQUIPMENT_FAILURE');
    assert.ok(testSpike.volume >= 4);
    assert.equal(testSpike.severity, 'HIGH');
  });

  test('Regression: recurring patterns must have distinct timestamps and never identical first/latest occurrence', async () => {
    const res = await fetch(`${getBaseUrl()}/api/analytics/trends?timeframe=30d`);
    assert.equal(res.status, 200);
    const body = await res.json();

    const patterns = body.data.recurringPatterns;
    assert.ok(Array.isArray(patterns));

    // 1. None of the recurring patterns should have identical first and latest occurrence
    for (const pattern of patterns) {
      assert.notEqual(
        pattern.firstOccurrence,
        pattern.latestOccurrence,
        `Pattern for ${pattern.storeCode} - ${pattern.category} should have distinct first and latest timestamps`
      );
      assert.ok(
        new Date(pattern.firstOccurrence).getTime() < new Date(pattern.latestOccurrence).getTime(),
        `firstOccurrence should be strictly earlier than latestOccurrence`
      );
      assert.ok(pattern.recurrenceCount >= 2);
    }

    // 2. The duplicated isolated complaint at TEST-STR-02 must NOT appear as a recurring pattern
    const isolatedPattern = patterns.find((p) => p.storeCode === 'TEST-STR-02' && p.category === 'STAFF_BEHAVIOUR');
    assert.equal(isolatedPattern, undefined, 'Duplicated one-off feedback should be excluded from recurring patterns');

    // 3. Risk level threshold assertions:
    // CRITICAL: recurrenceCount >= 6
    const critPattern = patterns.find((p) => p.storeCode === 'TEST-STR-03' && p.category === 'BILLING_DELAY');
    assert.ok(critPattern, 'Recurring billing delay at TEST-STR-03 should be detected');
    assert.equal(critPattern.recurrenceCount, 6);
    assert.equal(critPattern.riskLevel, 'CRITICAL');

    // HIGH: recurrenceCount >= 4 and < 6
    const equipPattern = patterns.find((p) => p.storeCode === 'TEST-STR-01' && p.category === 'EQUIPMENT_FAILURE');
    assert.ok(equipPattern, 'Recurring equipment failure at TEST-STR-01 should be detected');
    assert.equal(equipPattern.recurrenceCount, 4);
    assert.equal(equipPattern.riskLevel, 'HIGH');

    // MEDIUM: recurrenceCount < 4
    const medPattern = patterns.find((p) => p.storeCode === 'TEST-STR-04' && p.category === 'STOCK_SHORTAGE');
    assert.ok(medPattern, 'Recurring stock shortage at TEST-STR-04 should be detected');
    assert.equal(medPattern.recurrenceCount, 2);
    assert.equal(medPattern.riskLevel, 'MEDIUM');
  });

  test('Partial seeding and duplicate prevention: skips existing records without dropping unseeded records', async () => {
    const csvService = require('../src/services/csv.service');
    const partialCsv = `text,store_code,source_type,rating,category,provenance,timestamp
"Aisle 1 juice packets empty",TEST-SEED-STR,CUSTOMER_REVIEW,1,STOCK_SHORTAGE,SYNTHETIC_DEMO,2026-10-15T09:00:00Z
"Aisle 2 bread loaves expired",TEST-SEED-STR,CUSTOMER_REVIEW,1,PRODUCT_QUALITY,SYNTHETIC_DEMO,2026-10-15T09:15:00Z
"Aisle 3 milk crates missing",TEST-SEED-STR,CUSTOMER_REVIEW,1,STOCK_SHORTAGE,SYNTHETIC_DEMO,2026-10-15T09:30:00Z`;

    // 1. Initial import of 1 row (simulate partial database state)
    const singleRowCsv = `text,store_code,source_type,rating,category,provenance,timestamp
"Aisle 1 juice packets empty",TEST-SEED-STR,CUSTOMER_REVIEW,1,STOCK_SHORTAGE,SYNTHETIC_DEMO,2026-10-15T09:00:00Z`;
    const resInitial = await csvService.parseAndImportCsv(singleRowCsv, { skipDuplicates: true });
    assert.equal(resInitial.importedCount, 1);

    // 2. Full seed run of 3 rows: must import the 2 missing rows and skip the 1 existing row
    const resFull = await csvService.parseAndImportCsv(partialCsv, { skipDuplicates: true });
    assert.equal(resFull.importedCount, 2, 'Should import exactly the 2 unseeded rows');
    assert.equal(resFull.skippedCount, 1, 'Should safely skip the 1 already existing row');

    // 3. Repeated run: all 3 already exist, 0 new imported, 3 skipped
    const resRepeated = await csvService.parseAndImportCsv(partialCsv, { skipDuplicates: true });
    assert.equal(resRepeated.importedCount, 0, 'Should not import duplicates on repeated run');
    assert.equal(resRepeated.skippedCount, 3, 'Should skip all 3 existing rows');
  });

  test('GET /api/analytics/trends should support optional fillGaps parameter', async () => {
    // Sparse default
    const resSparse = await fetch(`${getBaseUrl()}/api/analytics/trends?timeframe=7d`);
    const bodySparse = await resSparse.json();
    assert.equal(bodySparse.success, true);
    // Sparse timeline only contains days with actual complaints
    assert.ok(bodySparse.data.timeline.length <= 7);

    // Continuous fillGaps = true
    const resFilled = await fetch(`${getBaseUrl()}/api/analytics/trends?timeframe=7d&fillGaps=true`);
    const bodyFilled = await resFilled.json();
    assert.equal(bodyFilled.success, true);
    // Continuous timeline contains all 7-8 consecutive calendar days
    assert.ok(bodyFilled.data.timeline.length >= 7);
    for (const entry of bodyFilled.data.timeline) {
      assert.ok(typeof entry.date === 'string');
      assert.ok(typeof entry.totalVolume === 'number');
      assert.ok(typeof entry.categories === 'object');
    }
  });

  test('GET /api/analytics/trends with store filter aligns timeline volume with spike volume', async () => {
    const res = await fetch(`${getBaseUrl()}/api/analytics/trends?storeId=TEST-STR-01&timeframe=7d`);
    assert.equal(res.status, 200);
    const body = await res.json();

    const spike = body.data.detectedSpikes.find((s) => s.storeCode === 'TEST-STR-01');
    assert.ok(spike);

    const timelineEntry = body.data.timeline.find((t) => t.date === spike.date);
    assert.ok(timelineEntry);
    assert.equal(
      timelineEntry.totalVolume,
      spike.volume,
      'Store-filtered timeline volume on spike day matches store spike volume'
    );
  });
});
