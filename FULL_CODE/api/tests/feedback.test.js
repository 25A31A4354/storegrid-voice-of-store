const test = require('node:test');
const assert = require('node:assert/strict');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');

test.describe('Feedback API Endpoints (/api/feedback)', () => {
  let createdFeedbackId = '';

  test.before(async () => {
    await setupTestServer();
  });

  test.after(async () => {
    await teardownTestServer();
  });

  test('POST /api/feedback should reject empty text with 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: '  ',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.some((d) => d.includes('at least 3 characters')));
  });

  test('POST /api/feedback should reject missing storeId/storeCode with 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Valid feedback text here',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.some((d) => d.includes('storeId (UUID) or storeCode')));
  });

  test('POST /api/feedback should reject invalid rating with 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'Valid feedback text here',
        rating: 10, // Invalid, max is 5
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.details.some((d) => d.includes('between 1 and 5')));
  });

  test('POST /api/feedback should successfully create feedback with 201', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'Aisle 3 was completely out of stock for cooking oil packets today.',
        rating: 2,
        language: 'en',
        sourceType: 'CUSTOMER_REVIEW',
        provenance: 'TEST',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id);
    assert.equal(body.data.storeCode, 'TEST-STR-01');
    assert.equal(body.data.detectedCategory, 'IT14'); // Triaged into official R5 category
    assert.equal(body.data.provenance, 'TEST');
    assert.equal(body.data.rating, 2);

    createdFeedbackId = body.data.id;
  });

  test('GET /api/feedback should list created feedback with pagination', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback?page=1&limit=10`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 10);
    assert.ok(body.pagination.totalRecords >= 1);
  });

  test('GET /api/feedback should filter by category', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback?category=IT14`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.every((f) => f.detectedCategory === 'IT14'));
  });

  test('GET /api/feedback/:id should retrieve feedback by ID', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback/${createdFeedbackId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, createdFeedbackId);
    assert.equal(body.data.storeCode, 'TEST-STR-01');
  });

  test('GET /api/feedback/:id should return 404 for unknown ID', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback/00000000-0000-0000-0000-000000000000`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FEEDBACK_NOT_FOUND');
  });
});
