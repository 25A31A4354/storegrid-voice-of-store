const test = require('node:test');
const assert = require('node:assert/strict');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');

test.describe('GET /api/health Endpoint', () => {
  test.before(async () => {
    await setupTestServer();
  });

  test.after(async () => {
    await teardownTestServer();
  });

  test('should return 200 OK with service and database metadata', async () => {
    const res = await fetch(`${getBaseUrl()}/api/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'storegrid-backend');
    assert.equal(data.version, '1.0.0');
    assert.equal(typeof data.uptime, 'number');
    assert.equal(data.database.connected, true);
    assert.ok(data.database.mode === 'postgresql' || data.database.mode === 'fallback');
    assert.ok(data.nlpService);
    assert.ok(typeof data.nlpService.available === 'boolean');
  });

  test('root endpoint should return 200 with service description', async () => {
    const res = await fetch(`${getBaseUrl()}/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.name, 'StoreGrid API');
    assert.equal(data.healthCheck, '/api/health');
  });
});
