const test = require('node:test');
const assert = require('node:assert/strict');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');

test.describe('CSV Import API Endpoint (/api/feedback/import)', () => {
  test.before(async () => {
    await setupTestServer();
  });

  test.after(async () => {
    await teardownTestServer();
  });

  test('POST /api/feedback/import should reject missing payload with 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'MISSING_CSV_PAYLOAD');
  });

  test('POST /api/feedback/import should import valid CSV records and report row errors', async () => {
    const csvContent = `text,store_code,source_type,rating,category,provenance
"Counter 1 billing delay was awful, waited 20 mins",TEST-STR-01,CUSTOMER_REVIEW,1,BILLING_DELAY,SYNTHETIC_DEMO
"",TEST-STR-01,CUSTOMER_REVIEW,2,STOCK_SHORTAGE,SYNTHETIC_DEMO
"Organic eggs out of stock on aisle 2",TEST-STR-01,STAFF_NOTE,3,STOCK_SHORTAGE,SYNTHETIC_DEMO`;

    const res = await fetch(`${getBaseUrl()}/api/feedback/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvContent,
        provenance: 'SYNTHETIC_DEMO',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.summary.totalProcessed, 3);
    assert.equal(body.summary.importedCount, 2); // Rows 1 and 3 succeed
    assert.equal(body.summary.failedCount, 1); // Row 2 failed due to empty text

    assert.ok(body.errors.some((e) => e.row === 2 && e.error.includes('Feedback text is missing')));
  });
});
