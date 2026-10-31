const test = require('node:test');
const assert = require('node:assert/strict');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');

test.describe('Frontend Contracts & Integration Endpoints', () => {
  let createdFeedbackId = '';

  test.before(async () => {
    await setupTestServer();

    // Create a seed feedback item needing review
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'Ambiguous comment about checkout counter speed and item availability',
        rating: 3,
        language: 'en',
        category: 'NEEDS_REVIEW',
        sourceType: 'CUSTOMER_REVIEW',
        provenance: 'TEST',
      }),
    });
    const body = await res.json();
    createdFeedbackId = body.data.id;
  });

  test.after(async () => {
    await teardownTestServer();
  });

  test('GET /api/dashboard/overview returns expected frontend metrics and category breakdown', async () => {
    const res = await fetch(`${getBaseUrl()}/api/dashboard/overview?storeId=TEST-STR-01&dateRange=last7`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.metrics);
    assert.ok(typeof body.data.metrics.totalFeedback === 'number');
    assert.ok(typeof body.data.metrics.needsAttention === 'number');
    assert.ok(typeof body.data.metrics.criticalIssues === 'number');
    assert.ok(typeof body.data.metrics.needsReview === 'number');
    assert.ok(body.data.metrics.totalFeedback >= 1);
    assert.ok(body.data.metrics.needsReview >= 1);

    assert.ok(Array.isArray(body.data.categoryBreakdown));
    assert.ok(body.data.categoryBreakdown.length >= 6);
    assert.ok(Array.isArray(body.data.topIssues));
  });

  test('GET /api/feedback?needsReviewOnly=true filters items requiring review', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback?needsReviewOnly=true`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((item) => item.category === 'NEEDS_REVIEW' || item.needsReview === true));
  });

  test('PATCH /api/feedback/:id/review updates category, notes, and resolution status', async () => {
    const updatePayload = {
      category: 'BILLING_DELAY',
      notes: 'Verified cashier slowdown during rush hour',
      resolved: true,
    };

    const res = await fetch(`${getBaseUrl()}/api/feedback/${createdFeedbackId}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, createdFeedbackId);
    assert.equal(body.data.category, 'BILLING_DELAY');
    assert.equal(body.data.detectedCategory, 'BILLING_DELAY');
    assert.equal(body.data.resolved, true);
    assert.equal(body.data.needsReview, false);
    assert.equal(body.data.metadata?.notes, updatePayload.notes);
  });

  test('PATCH /api/feedback/:id/review returns 404 for unknown feedback ID', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback/00000000-0000-0000-0000-000000000000/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'OTHER' }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FEEDBACK_NOT_FOUND');
  });

  test('GET /api/stores returns registered stores with frontend compatible keys', async () => {
    const res = await fetch(`${getBaseUrl()}/api/stores`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    const store = body.data.find((s) => s.code === 'TEST-STR-01');
    assert.ok(store);
    assert.ok(store.id);
    assert.equal(store.name, 'Test Store Alpha');
  });
});
