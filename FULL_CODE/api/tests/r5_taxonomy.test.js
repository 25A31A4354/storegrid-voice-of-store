const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../src/app');
const db = require('../src/db');
const { assertSeriousIssueOrReview } = require('./test_helper');
const { CATEGORIES, OFFICIAL_R5_CATEGORIES, TAXONOMY_MAP, PRIORITIES } = require('../src/constants/enums');
const { evaluatePriority, formatFeedback } = require('../src/services/feedback.service');

let server;
let baseUrl;

function getBaseUrl() {
  return baseUrl;
}

describe('R5 Official Issue Taxonomy & Classification Verification Suite', () => {
  before(async () => {
    await db.initDb({ inMemory: true });
    await db.query(
      `INSERT INTO stores (id, code, name, city, region, created_at, updated_at)
       VALUES ('store-r5-01', 'STR-R5-01', 'Banjara Hills Supercenter', 'Hyderabad', 'South', datetime('now'), datetime('now'))
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

  // =========================================================================
  // 1. EXACT REFRIGERATION DEMONSTRATED BUG FIX (TASK 5)
  // =========================================================================
  test.describe('1. Refrigeration Cold-Chain Classification (Demonstrated Bug Fix)', () => {
    const refrigerationText =
      'The refrigerator is not cooling properly, and several customers have complained about spoiled milk.';

    test('Classifies demonstrated refrigeration input directly into IT10 with high policy floor', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'STR-R5-01',
          text: refrigerationText,
          rating: 1,
          sourceType: 'CUSTOMER_REVIEW',
          provenance: 'OFFICIAL_DATASET',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);

      // Verify category is IT10 (Refrigeration / cold-chain failure)
      assert.equal(body.data.detectedCategory, 'IT10');
      assert.equal(body.data.category, 'IT10');

      // Policy severity floor for IT10 is high
      assert.equal(body.data.priority, PRIORITIES.HIGH);
      assert.equal(body.data.severity, 'high');

      // Actionable is 1 according to official taxonomy
      assert.equal(body.data.actionable, 1);

      // Owner function according to official taxonomy is Store Ops
      assert.equal(body.data.department, 'Store Ops');

      // Matched trigger terms are extracted and surfaced on top-level
      assert.ok(Array.isArray(body.data.matchedTerms));
      assert.ok(body.data.matchedTerms.length >= 1);
      assert.ok(
        body.data.matchedTerms.some(
          (term) => term.includes('refrigeration') || term.includes('cooling') || term.includes('spoiled')
        )
      );

      // Rule-based heuristic match score is present and distinct from calibrated probability
      assert.ok(typeof body.data.confidence === 'number');
      assert.ok(body.data.confidence >= 0.7);
    });

    test('evaluatePriority correctly applies high policy floor to IT10', () => {
      const priority = evaluatePriority({
        text: refrigerationText,
        category: 'IT10',
        rating: 2,
        autoFlagCritical: true,
      });
      assert.equal(priority, PRIORITIES.HIGH);
    });
  });

  // =========================================================================
  // 2. REPRESENTATIVE EXAMPLES FROM OFFICIAL CATEGORIES (TASK 8)
  // =========================================================================
  test.describe('2. Representative Official Categories (Operational IT01 - IT30)', () => {
    const representativeCases = [
      {
        id: 'IT01',
        name: 'Long checkout queue / slow billing',
        text: 'The billing queue is moving extremely slow at counter 4, cashier taking 10 minutes per person.',
        expectedCategory: 'IT01',
        expectedOwner: 'Store Ops',
      },
      {
        id: 'IT04',
        name: 'Staff misconduct',
        text: 'The security staff at the entrance was shouting abusive words and screamed at my mother.',
        expectedCategory: 'IT04',
        expectedOwner: 'HR',
        expectedFloor: 'high',
      },
      {
        id: 'IT06',
        name: 'Hygiene lapse',
        text: 'Saw a big cockroach running across the raw food counter and foul smell near meat section.',
        expectedCategory: 'IT06',
        expectedOwner: 'Store Ops',
        expectedFloor: 'high',
      },
      {
        id: 'IT08',
        name: 'Physical safety hazard',
        text: 'Wet floor near aisle 2 has no warning sign and an elderly customer slipped.',
        expectedCategory: 'IT08',
        expectedOwner: 'Store Ops',
        expectedFloor: 'high',
      },
      {
        id: 'IT11',
        name: 'Equipment breakdown',
        text: 'The barcode scanner at express checkout broke down and weighing scale is not working.',
        expectedCategory: 'IT11',
        expectedOwner: 'Store Ops',
      },
      {
        id: 'IT14',
        name: 'Out of stock / empty shelves',
        text: 'Sunflower cooking oil and basmati rice packets are completely out of stock with empty shelves.',
        expectedCategory: 'IT14',
        expectedOwner: 'Supply Chain',
      },
      {
        id: 'IT16',
        name: 'Expired product on shelf',
        text: 'Found bread packets on display that were expired 3 days ago.',
        expectedCategory: 'IT16',
        expectedOwner: 'Store Ops',
        expectedFloor: 'high',
      },
      {
        id: 'IT17',
        name: 'Foreign object in product',
        text: 'Found sharp plastic shard and dead insect inside sealed flour packet.',
        expectedCategory: 'IT17',
        expectedOwner: 'Merchandising',
        expectedFloor: 'high',
      },
      {
        id: 'IT19',
        name: 'Shelf price vs bill price mismatch',
        text: 'Shelf price tag showed 120 rupees but cashier billed me 160 rupees at counter.',
        expectedCategory: 'IT19',
        expectedOwner: 'Merchandising',
      },
      {
        id: 'IT27',
        name: 'Payment failure / money debited',
        text: 'UPI payment failed twice at counter but money was debited from my bank account.',
        expectedCategory: 'IT27',
        expectedOwner: 'Digital',
      },
    ];

    for (const tc of representativeCases) {
      test(`Correctly classifies representative feedback for ${tc.id} (${tc.name})`, async () => {
        const res = await fetch(`${getBaseUrl()}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeCode: 'STR-R5-01',
            text: tc.text,
            rating: 2,
            sourceType: 'CUSTOMER_REVIEW',
            provenance: 'TEST',
          }),
        });

        assert.equal(res.status, 201);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.data.detectedCategory, tc.expectedCategory);
        assert.equal(body.data.department, tc.expectedOwner);

        if (tc.expectedFloor === 'high') {
          assert.ok(
            body.data.priority === PRIORITIES.HIGH || body.data.priority === PRIORITIES.CRITICAL,
            `Expected priority to be at least HIGH for ${tc.id}, got ${body.data.priority}`
          );
          assert.equal(body.data.severity, 'high');
        }
      });
    }
  });

  // =========================================================================
  // 3. NON-ISSUE CATEGORIES (NI01, NI02, NI03)
  // =========================================================================
  test.describe('3. Non-Issue Categories (NI01, NI02, NI03)', () => {
    test('Classifies positive customer compliment to NI01 (Praise / compliment)', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'STR-R5-01',
          text: 'Excellent service and very polite staff today. Store was spotless and well organized!',
          rating: 5,
          sourceType: 'CUSTOMER_SURVEY',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.detectedCategory, 'NI01');
      assert.equal(body.data.actionable, 0);
      assert.equal(body.data.priority, PRIORITIES.LOW);
    });

    test('Classifies general question or suggestion to NI02 (General comment / suggestion)', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'STR-R5-01',
          text: 'Is this store open on Sundays and national holidays? Just a general question.',
          rating: 4,
          sourceType: 'KIOSK_FEEDBACK',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.detectedCategory, 'NI02');
      assert.equal(body.data.actionable, 0);
    });

    test('Classifies spam or gibberish to NI03 or NEEDS_REVIEW without crashing', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'STR-R5-01',
          text: 'asdfghjkl zxcvbnm qwertyuiop http://spamlink.com buy crypto fast click here',
          rating: 3,
          sourceType: 'CUSTOMER_REVIEW',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(['NI03', 'NEEDS_REVIEW'].includes(body.data.detectedCategory));
    });
  });

  // =========================================================================
  // 4. AMBIGUOUS & MULTI-ISSUE FEEDBACK HANDLING (TASK 6)
  // =========================================================================
  test.describe('4. Ambiguous & Multi-Issue Feedback Handling', () => {
    test('Multi-intent complaints go to the more serious problem or to review', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'STR-R5-01',
          text: 'Cashier was extremely rude and arrogant, plus the bread was expired and moldy on the shelf',
          rating: 1,
          sourceType: 'CUSTOMER_REVIEW',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);

      assertSeriousIssueOrReview(body.data);
    });

    test('Handles low-information or vague text by routing to review', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'STR-R5-01',
          text: 'Something felt a bit weird today, not sure what.',
          rating: 3,
          sourceType: 'CUSTOMER_REVIEW',
          provenance: 'TEST',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.needsReview, true);
    });
  });

  // =========================================================================
  // 5. TAXONOMY MAP & API SERIALIZATION VERIFICATION (TASK 3 & 4)
  // =========================================================================
  test.describe('5. Taxonomy Map Completeness & API Serialization', () => {
    test('TAXONOMY_MAP contains all 33 official category IDs (IT01-IT30, NI01-NI03)', () => {
      const officialKeys = Object.keys(OFFICIAL_R5_CATEGORIES);
      assert.equal(officialKeys.length, 33);

      for (let i = 1; i <= 30; i++) {
        const id = `IT${String(i).padStart(2, '0')}`;
        assert.ok(TAXONOMY_MAP[id], `Missing metadata for ${id}`);
        assert.equal(TAXONOMY_MAP[id].id, id);
        assert.ok(TAXONOMY_MAP[id].name);
        assert.ok(TAXONOMY_MAP[id].owner);
        assert.ok(['low', 'medium', 'high'].includes(TAXONOMY_MAP[id].policyFloor));
        assert.equal(TAXONOMY_MAP[id].isActionable, 1);
      }

      ['NI01', 'NI02', 'NI03'].forEach((id) => {
        assert.ok(TAXONOMY_MAP[id], `Missing metadata for ${id}`);
        assert.equal(TAXONOMY_MAP[id].isActionable, 0);
      });
    });

    test('formatFeedback surfaces all enriched taxonomy fields on top-level response', () => {
      const dummyRow = {
        id: 'test-row-1',
        store_id: 'store-1',
        store_code: 'STR-1',
        store_name: 'Store 1',
        text: 'Freezer not cooling and milk spoiled',
        source_type: 'CUSTOMER_REVIEW',
        timestamp: new Date().toISOString(),
        rating: 1,
        language: 'en',
        detected_category: 'IT10',
        sentiment: 'negative',
        processing_status: 'PROCESSED',
        provenance: 'MANUAL_ENTRY',
        metadata: JSON.stringify({
          priority: 'HIGH',
          confidence: 0.95,
          needsReview: false,
          nlp: {
            category: 'IT10',
            categoryName: 'Refrigeration / cold-chain failure',
            matchedTerms: ['refrigeration cooling failure'],
            severity: 'high',
            actionable: 1,
            ownerFunction: 'Store Ops',
          },
        }),
      };

      const formatted = formatFeedback(dummyRow);
      assert.equal(formatted.category, 'IT10');
      assert.equal(formatted.categoryName, 'Refrigeration / cold-chain failure');
      assert.equal(formatted.department, 'Store Ops');
      assert.equal(formatted.severity, 'high');
      assert.equal(formatted.actionable, 1);
      assert.deepEqual(formatted.matchedTerms, ['refrigeration cooling failure']);
      assert.equal(formatted.priority, 'HIGH');
    });
  });

  // =========================================================================
  // 6. REGRESSION TESTS: LEGACY CATEGORY COMPATIBILITY
  // =========================================================================
  test.describe('6. Regression: Legacy Category Aliases Compatibility', () => {
    test('Preserves backward compatibility for legacy category queries and overrides', async () => {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode: 'STR-R5-01',
          text: 'Manual entry with explicit legacy category',
          category: CATEGORIES.STOCK_SHORTAGE,
          rating: 3,
          sourceType: 'STAFF_NOTE',
          provenance: 'MANUAL_ENTRY',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.category, 'STOCK_SHORTAGE');
    });
  });
});
