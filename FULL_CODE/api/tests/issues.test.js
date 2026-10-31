const test = require('node:test');
const assert = require('node:assert/strict');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');

test.describe('Issues API Endpoints (/api/issues)', () => {
  let createdIssueId = '';
  let linkedFeedbackId = '';

  test.before(async () => {
    await setupTestServer();

    // Create a sample feedback to link
    const fbRes = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'POS counter 2 is freezing on every debit card payment.',
        category: 'BILLING_DELAY',
        provenance: 'TEST',
      }),
    });
    const fbBody = await fbRes.json();
    linkedFeedbackId = fbBody.data.id;
  });

  test.after(async () => {
    await teardownTestServer();
  });

  test('POST /api/issues should reject missing title with 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        title: '',
        category: 'BILLING_DELAY',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  test('POST /api/issues should create issue and link feedback successfully', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        title: 'POS Terminal 2 Card Payment Freezes',
        description: 'Repeated software crash on counter 2 EFT transaction.',
        category: 'BILLING_DELAY',
        priority: 'HIGH',
        status: 'OPEN',
        ownerTeam: 'BILLING_TECH',
        assignedTo: 'Vikram Ops',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        linkedFeedbackIds: [linkedFeedbackId],
        createdBy: 'Vinay (Lead)',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.title, 'POS Terminal 2 Card Payment Freezes');
    assert.equal(body.data.priority, 'HIGH');
    assert.equal(body.data.status, 'OPEN');
    assert.equal(body.data.ownerTeam, 'BILLING_TECH');
    assert.equal(body.data.linkedFeedback.length, 1);
    assert.equal(body.data.linkedFeedback[0].id, linkedFeedbackId);
    assert.ok(body.data.history.length >= 1);

    createdIssueId = body.data.id;
  });

  test('GET /api/issues should list issues with pagination and filters', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues?status=OPEN&priority=HIGH`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.equal(body.data[0].id, createdIssueId);
  });

  test('GET /api/issues/:id should retrieve issue details with store and history', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues/${createdIssueId}`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, createdIssueId);
    assert.equal(body.data.store.code, 'TEST-STR-01');
    assert.ok(Array.isArray(body.data.linkedFeedback));
    assert.ok(Array.isArray(body.data.history));
  });

  test('PATCH /api/issues/:id/assignment should reassign team and log audit event', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues/${createdIssueId}/assignment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerTeam: 'STORE_OPS',
        assignedTo: 'Pooja Shift Mgr',
        notes: 'Transferred to on-site shift lead for local terminal reset',
        changedBy: 'Vinay (Lead)',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.ownerTeam, 'STORE_OPS');
    assert.equal(body.data.assignedTo, 'Pooja Shift Mgr');

    // Verify audit event
    const assignAudit = body.data.history.find((h) => h.action === 'ASSIGNMENT_CHANGED');
    assert.ok(assignAudit);
    assert.equal(assignAudit.changedBy, 'Vinay (Lead)');
  });

  test('PATCH /api/issues/:id/status should resolve issue and record resolution notes', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues/${createdIssueId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        resolutionNotes: 'Updated payment gateway firmware to v3.4. Terminal passed transaction tests.',
        changedBy: 'Vinay (Lead)',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'RESOLVED');
    assert.ok(body.data.resolvedAt);
    assert.ok(body.data.resolutionNotes.includes('Updated payment gateway firmware'));

    // Verify audit trail
    const statusAudit = body.data.history.find((h) => h.action === 'STATUS_CHANGED' && h.newValue === 'RESOLVED');
    assert.ok(statusAudit);
  });

  test('GET /api/issues/:id/history should return chronological audit events', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues/${createdIssueId}/history`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 2); // CREATED, ASSIGNMENT_CHANGED, STATUS_CHANGED

    const actions = body.data.map((h) => h.action);
    assert.ok(actions.includes('CREATED'));
    assert.ok(actions.includes('ASSIGNMENT_CHANGED'));
    assert.ok(actions.includes('STATUS_CHANGED'));
  });

  test('PATCH /api/issues/:id/status should return 404 for non-existent issue', async () => {
    const res = await fetch(`${getBaseUrl()}/api/issues/00000000-0000-0000-0000-000000000000/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'ISSUE_NOT_FOUND');
  });
});
