const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');
const config = require('../src/config');

test.describe('Varshith NLP Service Integration Tests', () => {
  let mockNlpServer = null;
  let mockNlpUrl = '';
  let receivedRequests = [];
  let shouldSimulateTimeout = false;
  let originalNlpUrl = config.nlpServiceUrl;
  let originalTimeout = config.nlpTimeoutMs;

  test.before(async () => {
    // 1. Spin up an ephemeral HTTP server matching Varshith's FastAPI contract
    mockNlpServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', service: 'storegrid-nlp', version: '1.0.0' }));
        return;
      }

      if (req.method === 'POST' && req.url === '/classify') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const payload = JSON.parse(body);
          receivedRequests.push(payload);

          if (shouldSimulateTimeout) {
            // Intentionally do not respond to trigger AbortController timeout
            return;
          }

          const text = (payload.text || '').toLowerCase();
          let category = 'NEEDS_REVIEW';
          let confidence = 0.0;
          let needsReview = true;
          let matchedTerms = [];

          if (text.includes('out of stock') || text.includes('stock ledu')) {
            category = 'STOCK_SHORTAGE';
            confidence = 0.95;
            needsReview = false;
            matchedTerms = ['out of stock'];
          } else if (text.includes('billing chala slow') || text.includes('slow billing')) {
            category = 'BILLING_DELAY';
            confidence = 0.95;
            needsReview = false;
            matchedTerms = ['billing chala slow'];
          } else if (text.includes('parking')) {
            category = 'OTHER';
            confidence = 0.9;
            needsReview = false;
            matchedTerms = ['parking space'];
          } else if (text.includes('rude') && text.includes('expired')) {
            category = 'NEEDS_REVIEW';
            confidence = 0.4;
            needsReview = true;
            matchedTerms = ['cashier was rude', 'expired'];
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              feedbackId: payload.feedbackId,
              storeId: payload.storeId,
              originalText: payload.text,
              cleanedText: text.trim(),
              category,
              confidence,
              needsReview,
              matchedTerms,
            })
          );
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => {
      mockNlpServer.listen(0, '127.0.0.1', () => {
        const port = mockNlpServer.address().port;
        mockNlpUrl = `http://127.0.0.1:${port}`;
        config.nlpServiceUrl = mockNlpUrl;
        resolve();
      });
    });

    // 2. Setup backend test server
    await setupTestServer();
  });

  test.after(async () => {
    config.nlpServiceUrl = originalNlpUrl;
    config.nlpTimeoutMs = originalTimeout;
    if (mockNlpServer) {
      await new Promise((resolve) => mockNlpServer.close(resolve));
    }
    await teardownTestServer();
  });

  test('GET /api/health should report NLP service as healthy when connected', async () => {
    const res = await fetch(`${getBaseUrl()}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(body.nlpService);
    assert.equal(body.nlpService.available, true);
    assert.equal(body.nlpService.service, 'storegrid-nlp');
    assert.equal(body.nlpService.version, '1.0.0');
  });

  test('POST /api/feedback should classify Telugu-English code-mixed billing delay via NLP', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'Billing chala slow ga undi counter daggara line peddaga undi',
        language: 'te-en',
        sourceType: 'KIOSK_FEEDBACK',
        provenance: 'TEST',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.detectedCategory, 'BILLING_DELAY');
    assert.equal(body.data.processingStatus, 'PROCESSED');

    // Verify rich metadata preservation
    assert.ok(body.data.metadata);
    assert.ok(body.data.metadata.nlp);
    assert.equal(body.data.metadata.nlp.category, 'BILLING_DELAY');
    assert.equal(body.data.metadata.nlp.confidence, 0.95);
    assert.equal(body.data.metadata.nlp.needsReview, false);
    assert.deepEqual(body.data.metadata.nlp.matchedTerms, ['billing chala slow']);
    assert.equal(body.data.metadata.nlp.serviceStatus, 'PROCESSED');
    assert.ok(body.data.metadata.nlp.classifiedAt);
  });

  test('POST /api/feedback should classify OTHER retail category via NLP (e.g. parking)', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'The parking space was completely full and difficult to enter.',
        sourceType: 'CUSTOMER_REVIEW',
        provenance: 'TEST',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.detectedCategory, 'OTHER');
    assert.equal(body.data.processingStatus, 'PROCESSED');
    assert.equal(body.data.metadata.nlp.category, 'OTHER');
    assert.equal(body.data.metadata.nlp.confidence, 0.9);
  });

  test('POST /api/feedback should handle conflicting multi-intent feedback with NEEDS_REVIEW and 0.40 score', async () => {
    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'The cashier was very rude and the milk was expired.',
        sourceType: 'CUSTOMER_REVIEW',
        provenance: 'TEST',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.detectedCategory, 'NEEDS_REVIEW');
    assert.equal(body.data.metadata.nlp.confidence, 0.4);
    assert.equal(body.data.metadata.nlp.needsReview, true);
    assert.ok(body.data.metadata.nlp.matchedTerms.includes('cashier was rude'));
    assert.ok(body.data.metadata.nlp.matchedTerms.includes('expired'));
  });

  test('POST /api/feedback should gracefully handle offline NLP service without losing feedback', async () => {
    // Point NLP URL to an unreachable address
    config.nlpServiceUrl = 'http://127.0.0.1:54321';

    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'Aisle assistant walked away when asked for help',
        sourceType: 'CUSTOMER_REVIEW',
        provenance: 'TEST',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id);
    // Baseline fallback routes it to STAFF_BEHAVIOUR or NEEDS_REVIEW, marked PENDING
    assert.equal(body.data.processingStatus, 'PENDING');
    assert.ok(body.data.metadata.nlp);
    assert.equal(body.data.metadata.nlp.serviceStatus, 'UNAVAILABLE');
    assert.equal(body.data.metadata.nlp.needsReview, true);
    assert.ok(body.data.metadata.nlp.error);

    // Restore mock URL
    config.nlpServiceUrl = mockNlpUrl;
  });

  test('POST /api/feedback should gracefully handle NLP service timeout', async () => {
    shouldSimulateTimeout = true;
    config.nlpTimeoutMs = 150; // Fast timeout for testing

    const res = await fetch(`${getBaseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'TEST-STR-01',
        text: 'Milk packets stock ledu shelves khali ga unnai store lo.',
        language: 'te-en',
        sourceType: 'CUSTOMER_REVIEW',
        provenance: 'TEST',
      }),
    });

    shouldSimulateTimeout = false;
    config.nlpTimeoutMs = 3000;

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id);
    assert.equal(body.data.processingStatus, 'PENDING');
    assert.ok(
      body.data.metadata.nlp.serviceStatus === 'TIMEOUT' || body.data.metadata.nlp.serviceStatus === 'UNAVAILABLE'
    );
  });
});
