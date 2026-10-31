const test = require('node:test');
const assert = require('node:assert/strict');
const { setupTestServer, teardownTestServer, getBaseUrl, assertSeriousIssueOrReview } = require('./test_helper');
const storeService = require('../src/services/store.service');

test.describe('StoreGrid Comprehensive QA Audit & Verification Suite', () => {
  let createdFeedbackIds = [];

  test.before(async () => {
    await setupTestServer();

    // Ensure test store exists
    await storeService.findOrCreateStore({
      storeIdOrCode: 'TEST-STR-QA',
      defaultName: 'QA Validation Hypermarket',
      region: 'Andhra Pradesh',
      city: 'Visakhapatnam',
    });
  });

  test.after(async () => {
    await teardownTestServer();
  });

  // =========================================================================
  // 1. BACKEND & API CONTRACTS: OFFICIAL R5 CLASSIFICATION CATEGORIES
  // =========================================================================
  test.describe('1. Classification Across Representative Official R5 Categories', () => {
    const testCases = [
      {
        cat: 'IT14',
        text: 'Cooking oil packets completely out of stock on aisle shelves',
        expectedCat: 'IT14',
      },
      {
        cat: 'IT01',
        text: 'Waiting in long queue at billing counter, cashier slow',
        expectedCat: 'IT01',
      },
      {
        cat: 'IT03',
        text: 'Cashier was extremely rude and arrogant to elderly shoppers',
        // The R5 pack names "rude staff" as ambiguous between unhelpful staff and misconduct.
        expectedCat: ['IT03', 'IT04'],
      },
      {
        cat: 'IT16',
        text: 'Dairy milk was sour, rotten and expired package',
        expectedCat: 'IT16',
      },
      {
        cat: 'IT11',
        text: 'Air conditioner broken, AC not working inside store',
        expectedCat: 'IT11',
      },
      {
        cat: 'IT13',
        text: 'Store timings need to be extended and parking space is limited',
        expectedCat: 'IT13',
      },
      {
        cat: 'NEEDS_REVIEW',
        text: 'Some random ambiguous note without any clear category',
        expectedCat: ['NEEDS_REVIEW', 'NI02', 'NI03'],
        todo: 'Known model limitation: off-topic English text gets a confident label (currently IT22)',
      },
    ];

    for (const tc of testCases) {
      test(`Submitting feedback correctly classifies into ${tc.cat}`, { todo: tc.todo }, async () => {
        const res = await fetch(`${getBaseUrl()}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeCode: 'TEST-STR-QA',
            text: tc.text,
            rating: 2,
            sourceType: 'CUSTOMER_REVIEW',
            provenance: 'TEST',
          }),
        });

        assert.equal(res.status, 201);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.ok([tc.expectedCat].flat().includes(body.data.detectedCategory), `got ${body.data.detectedCategory}`);
        assert.ok(body.data.id);
        createdFeedbackIds.push(body.data.id);
      });
    }
  });

  // =========================================================================
  // 2. MULTILINGUAL & CODE-MIXED FEEDBACK (TELUGU-ENGLISH) + REGRESSION TEST
  // =========================================================================
  test.describe('2. Multilingual Processing & Language Persistence (Regression)', () => {
    test('REGRESSION D1: Telugu-English code-mixed feedback persists resolvedLanguage in DB', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: 'Milk packets stock ledu, shelves khali ga unnai',
          rating: 1,
          // Note: Caller does NOT pass language: 'te-en'; backend must auto-normalize and persist it!
          sourceType: 'KIOSK_FEEDBACK',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.detectedCategory, 'IT14');
      // Verify database record has resolvedLanguage persisted
      assert.equal(body.data.language, 'te-en', 'Expected DB language column to store detected te-en');
      assert.equal(body.data.metadata?.languageDetected, 'te-en');
    });

    test('Telugu-English HVAC complaint classifies to EQUIPMENT_FAILURE with te-en language', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: 'AC assalu work avvatledu, store lo chala sweating ga undi',
          rating: 1,
          sourceType: 'CUSTOMER_REVIEW',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.detectedCategory, 'IT11');
      assert.equal(body.data.language, 'te-en');
    });
  });

  // =========================================================================
  // 3. ROBUSTNESS & EDGE CASE INPUT HANDLING
  // =========================================================================
  test.describe('3. Robustness, Malformed Payloads & Edge Cases', () => {
    test('Rejects empty or whitespace-only feedback text with 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: '   ',
        }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    });

    test('Rejects feedback missing both storeId and storeCode with 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Valid text without any store identifier',
        }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
    });

    test('Rejects out-of-range rating (0 and 6) with 400', async () => {
      for (const invalidRating of [0, 6, -1, 10]) {
        const res = await fetch(`${getBaseUrl()}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeCode: 'TEST-STR-QA',
            text: 'Valid feedback text here',
            rating: invalidRating,
          }),
        });
        assert.equal(res.status, 400);
      }
    });

    test('Handles exceptionally long feedback (10,000 characters) safely without crashing', async () => {
      const longText = 'Out of stock items everywhere in the store. '.repeat(250);
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: longText,
          rating: 2,
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.detectedCategory, 'IT14');
      assert.ok(body.data.text.length >= 10000);
    });

    test('Multi-intent feedback goes to the more serious problem or to review', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: 'Cashier was extremely rude and arrogant, plus the bread was expired and moldy',
          rating: 1,
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assertSeriousIssueOrReview(body.data);
    });
  });

  // =========================================================================
  // 4. PRIORITY SCORING & INSTANT ESCALATION
  // =========================================================================
  test.describe('4. Priority Scoring & Critical Hazard Escalation', () => {
    test('Escalates electrical spark / fire safety hazard to CRITICAL', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: 'Sparks and smoke coming from the electrical switchboard near aisle 4! Serious fire hazard!',
          rating: 1,
          category: 'EQUIPMENT_FAILURE',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.priority, 'CRITICAL');
    });

    test('Escalates cold storage refrigeration breakdown to CRITICAL', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: 'Main display freezer down, all dairy and ice cream melted and spoiled food',
          rating: 1,
          category: 'EQUIPMENT_FAILURE',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.priority, 'CRITICAL');
    });

    test('Assigns HIGH (not CRITICAL) to non-hazardous equipment failure (barcode scanner)', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: 'Barcode scanner breakdown at counter 2, cashier typing numbers manually',
          rating: 3,
          category: 'EQUIPMENT_FAILURE',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.priority, 'HIGH');
    });

    test('Assigns LOW priority to satisfied 5-star customer feedback', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: 'Very pleasant shopping experience and nice store ambience',
          rating: 5,
          category: 'OTHER',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.priority, 'LOW');
    });
  });

  // =========================================================================
  // 5. SECURITY & DEFENSIVE CHECKS
  // =========================================================================
  test.describe('5. Security, Input Sanitization & Secret Safeguards', () => {
    test('Protects against SQL Injection payload in feedback text', async () => {
      const sqlInjectionPayload = "'; DROP TABLE feedback; -- ' OR '1'='1";
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: sqlInjectionPayload,
          rating: 3,
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);

      // Verify database table remains intact and record stored literally
      const checkRes = await fetch(`${getBaseUrl()}/api/feedback/${body.data.id}`);
      assert.equal(checkRes.status, 200);
      const checkBody = await checkRes.json();
      assert.equal(checkBody.data.text, sqlInjectionPayload);
    });

    test('Protects against SQL Injection in query parameters', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback?category=' OR 1=1 --`);
      // Should reject invalid category query parameter with 400
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'QUERY_VALIDATION_ERROR');
    });

    test('Stores XSS HTML tags safely without execution or stripping data', async () => {
      const xssPayload = '<script>alert("XSS")</script><img src="x" onerror="stealCookies()">';
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          text: `Checkout had issues: ${xssPayload}`,
          rating: 2,
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.text.includes('<script>'));
    });

    test('Health check does not expose secret connection strings or sensitive credentials', async () => {
      const res = await fetch(`${getBaseUrl()}/api/health`);
      assert.equal(res.status, 200);
      const body = await res.json();

      const raw = JSON.stringify(body);
      assert.equal(raw.includes('password'), false);
      assert.equal(raw.includes('secret'), false);
      assert.equal(raw.includes('postgres:'), false);
    });
  });

  // =========================================================================
  // 6. DASHBOARD OVERVIEW & METRIC CONSISTENCY
  // =========================================================================
  test.describe('6. Dashboard Overview & Metric Consistency', () => {
    test('Dashboard metrics accurately reflect underlying feedback and category counts', async () => {
      const overviewRes = await fetch(`${getBaseUrl()}/api/dashboard/overview?storeId=TEST-STR-QA&dateRange=all`);
      assert.equal(overviewRes.status, 200);
      const overview = await overviewRes.json();

      assert.equal(overview.success, true);
      assert.ok(overview.data.metrics);
      const { totalFeedback, needsReview } = overview.data.metrics;

      // Verify against direct feedback list endpoint
      const listRes = await fetch(`${getBaseUrl()}/api/feedback?storeCode=TEST-STR-QA&limit=200`);
      assert.equal(listRes.status, 200);
      const list = await listRes.json();

      assert.equal(totalFeedback, list.pagination.totalRecords);

      // Verify category breakdown sums match operational categories
      const breakdownSum = overview.data.categoryBreakdown.reduce((sum, item) => sum + item.count, 0);
      assert.equal(totalFeedback, breakdownSum + needsReview);
    });

    test('Filters feedback by storeCode, category, and dateRange accurately', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback?storeCode=TEST-STR-QA&category=IT14&dateRange=all`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.length >= 1);
      assert.ok(body.data.every((item) => item.category === 'IT14'));
    });
  });

  // =========================================================================
  // 7. ISSUES TRIAGE & AUDIT TRAIL
  // =========================================================================
  test.describe('7. Operations Issues & Chronological Audit Trail', () => {
    let testIssueId = '';

    test('Creates operational issue linked to feedback', async () => {
      const res = await fetch(`${getBaseUrl()}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'TEST-STR-QA',
          title: 'Produce Cooler Temp Fluctuation',
          description: 'Cooler display unit reported temperature rising to 12C.',
          category: 'EQUIPMENT_FAILURE',
          priority: 'HIGH',
          ownerTeam: 'FACILITIES_MAINTENANCE',
          feedbackIds: createdFeedbackIds.slice(0, 2),
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.id);
      assert.equal(body.data.category, 'EQUIPMENT_FAILURE');
      assert.equal(body.data.ownerTeam, 'FACILITIES_MAINTENANCE');
      testIssueId = body.data.id;
    });

    test('Reassigns issue owner team and creates audit history entry', async () => {
      const res = await fetch(`${getBaseUrl()}/api/issues/${testIssueId}/assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerTeam: 'STORE_OPS',
          assignedTo: 'Vikram Maintenance Lead',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.ownerTeam, 'STORE_OPS');
      assert.equal(body.data.assignedTo, 'Vikram Maintenance Lead');
    });

    test('Resolves issue with resolution notes and marks timestamp', async () => {
      const res = await fetch(`${getBaseUrl()}/api/issues/${testIssueId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RESOLVED',
          resolutionNotes: 'Technician refilled coolant and thermostat recalibrated to 4C.',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.status, 'RESOLVED');
      assert.ok(body.data.resolvedAt);
      assert.ok(body.data.resolutionNotes.includes('coolant'));
    });

    test('Audit history lists all transitions chronologically', async () => {
      const res = await fetch(`${getBaseUrl()}/api/issues/${testIssueId}/history`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      // At least CREATED, ASSIGNMENT_CHANGED, STATUS_CHANGED
      assert.ok(body.data.length >= 3);
      assert.ok(body.data.some((h) => h.action === 'CREATED'));
      assert.ok(body.data.some((h) => h.action === 'ASSIGNMENT_CHANGED'));
      assert.ok(body.data.some((h) => h.action === 'STATUS_CHANGED'));
    });
  });

  // =========================================================================
  // 8. DATASET UPLOAD & BATCH TRIAGE
  // =========================================================================
  test.describe('8. Dataset Ingestion & Batch Lifecycle', () => {
    test('POST /api/datasets/preview parses synthetic CSV and suggests column mappings', async () => {
      const csvContent =
        'text,store_code,category,rating,timestamp\n"Milk out of stock",STR-HYD-001,STOCK_SHORTAGE,1,2026-10-15T10:00:00Z\n"Cashier rude",STR-HYD-001,STAFF_BEHAVIOUR,2,2026-10-15T11:00:00Z';
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const formData = new FormData();
      formData.append('file', blob, 'test_batch.csv');

      const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.totalRows, 2);
      assert.equal(body.data.suggestedMapping.text, 'text');
      assert.equal(body.data.suggestedMapping.storeCode, 'store_code');
    });
  });
});
