const http = require('http');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/db');
const storeService = require('../src/services/store.service');

let server = null;
let baseUrl = '';

/**
 * Start test server on random available port with an in-memory SQLite database
 */
async function setupTestServer() {
  process.env.NODE_ENV = 'test';
  await db.initDb({ inMemory: true, forceFallback: true });

  // Provision base test store
  await storeService.findOrCreateStore({
    storeIdOrCode: 'TEST-STR-01',
    defaultName: 'Test Store Alpha',
    region: 'Test Region',
    city: 'Test City',
  });

  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve({ server, baseUrl });
    });
  });
}

async function teardownTestServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  await db.closeDb();
}

function getBaseUrl() {
  return baseUrl;
}

/**
 * For "rude cashier, plus the bread was expired": expired food (IT16, high by policy) should win,
 * or the comment should go to the review queue. Either is a safe outcome; a staff label alone is not.
 */
function assertSeriousIssueOrReview(item) {
  if (item.detectedCategory === 'NEEDS_REVIEW') {
    assert.equal(item.needsReview, true);
    return;
  }
  assert.equal(item.detectedCategory, 'IT16');
  assert.ok(['high', 'critical'].includes(item.severity), `severity was ${item.severity}`);
}

module.exports = {
  assertSeriousIssueOrReview,
  setupTestServer,
  teardownTestServer,
  getBaseUrl,
};
