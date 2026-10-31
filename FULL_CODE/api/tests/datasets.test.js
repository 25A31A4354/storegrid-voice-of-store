const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { setupTestServer, teardownTestServer, getBaseUrl } = require('./test_helper');

test.describe('Dataset Ingestion & Batch Analytics API Endpoints', () => {
  let createdBatchId = '';

  test.before(async () => {
    await setupTestServer();
  });

  test.after(async () => {
    await teardownTestServer();
  });

  test('POST /api/datasets/preview rejects requests without a file', async () => {
    const formData = new FormData();
    const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error.message, /No file uploaded/i);
  });

  test('POST /api/datasets/preview correctly inspects and auto-maps CSV file', async () => {
    const csvContent = `id,store,timestamp,rating,details,asset\nCMP-901,TEST-STR-01,2026-10-15T10:00:00Z,1,Freezer temperature is leaking melted dairy,freezer-01\nCMP-902,TEST-STR-01,2026-10-15T11:00:00Z,2,Billing counter is slow,pos-02\n`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'complaints_test.csv');

    const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.filename, 'complaints_test.csv');
    assert.equal(body.data.format, 'CSV');
    assert.equal(body.data.totalRows, 2);
    assert.deepEqual(body.data.headers, ['id', 'store', 'timestamp', 'rating', 'details', 'asset']);
    assert.equal(body.data.suggestedMapping.text, 'details');
    assert.equal(body.data.suggestedMapping.storeId, 'store');
    assert.equal(body.data.suggestedMapping.rating, 'rating');
    assert.equal(body.data.suggestedMapping.id, 'id');
  });

  test('POST /api/datasets/preview correctly inspects JSON array file', async () => {
    const jsonContent = JSON.stringify([
      {
        id: 'JSON-01',
        storeCode: 'TEST-STR-01',
        date: '2026-10-16T12:00:00Z',
        rating: 1,
        text: 'Chiller stopped working',
      },
      {
        id: 'JSON-02',
        storeCode: 'TEST-STR-01',
        date: '2026-10-16T12:30:00Z',
        rating: 3,
        text: 'Store is clean but shelf is empty',
      },
    ]);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob, 'feedback_batch.json');

    const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.format, 'JSON');
    assert.equal(body.data.totalRows, 2);
    assert.equal(body.data.suggestedMapping.text, 'text');
    assert.equal(body.data.suggestedMapping.storeId, 'storeCode');
  });

  test('POST /api/datasets/preview correctly inspects XLSX file', async () => {
    const worksheetData = [
      ['id', 'store', 'rating', 'details'],
      ['XLS-01', 'TEST-STR-01', 1, 'Ice cream tubs melted due to freezer shutdown'],
      ['XLS-02', 'TEST-STR-01', 2, 'Counter payment terminal declined card'],
    ];
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Complaints').addRows(worksheetData);
    const xlsxBuffer = await wb.xlsx.writeBuffer();

    const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const formData = new FormData();
    formData.append('file', blob, 'store_complaints.xlsx');

    const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.format, 'EXCEL');
    assert.equal(body.data.totalRows, 2);
    assert.equal(body.data.suggestedMapping.text, 'details');
  });

  test('POST /api/datasets/preview keeps quoted commas and ignores an Excel byte-order mark', async () => {
    const csvContent = '\uFEFFstore,text\nTEST-STR-01,"Freezer broken, milk spoiled"\n';
    const formData = new FormData();
    formData.append('file', new Blob([csvContent], { type: 'text/csv' }), 'bom.csv');

    const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, { method: 'POST', body: formData });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.totalRows, 1);
    assert.deepEqual(body.data.headers, ['store', 'text']);
    assert.equal(body.data.previewRows[0].text, 'Freezer broken, milk spoiled');
  });

  test('POST /api/datasets/preview reads tab-separated text files', async () => {
    const tsvContent = 'store\ttext\nTEST-STR-01\tFreezer broken, milk spoiled\n';
    const formData = new FormData();
    formData.append('file', new Blob([tsvContent], { type: 'text/plain' }), 'export.txt');

    const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, { method: 'POST', body: formData });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.data.headers, ['store', 'text']);
    assert.equal(body.data.previewRows[0].text, 'Freezer broken, milk spoiled');
  });

  test('POST /api/datasets/preview explains that legacy .xls files are not supported', async () => {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], { type: 'application/vnd.ms-excel' }),
      'old.xls'
    );

    const res = await fetch(`${getBaseUrl()}/api/datasets/preview`, { method: 'POST', body: formData });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(JSON.stringify(body), /Save the file as \.xlsx or \.csv/);
  });

  test('POST /api/datasets/upload rejects missing text column mapping', async () => {
    const csvContent = `store,rating\nTEST-STR-01,1\n`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'missing_text.csv');
    formData.append('columnMapping', JSON.stringify({ storeId: 'store', rating: 'rating' }));

    const res = await fetch(`${getBaseUrl()}/api/datasets/upload`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error.message, /Column mapping must specify a source column for 'text'/i);
  });

  test('POST /api/datasets/upload imports CSV and runs Sanjay priority trends module', async () => {
    const csvContent = `id,store,timestamp,rating,details,asset\nCMP-101,TEST-STR-01,2026-10-15T09:00:00Z,1,Deep freezer unit is completely off and dairy is spoiling,freezer-01\nCMP-102,TEST-STR-01,2026-10-15T10:00:00Z,2,Billing counter scanner is slow,pos-01\nCMP-103,TEST-STR-01,2026-10-15T11:00:00Z,1,Cold storage alarm sounding hazard,cold-01\n`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'oct_complaints.csv');
    formData.append(
      'columnMapping',
      JSON.stringify({
        id: 'id',
        storeId: 'store',
        timestamp: 'timestamp',
        rating: 'rating',
        text: 'details',
        itemOrAssetId: 'asset',
      })
    );

    const res = await fetch(`${getBaseUrl()}/api/datasets/upload`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.totalRecords, 3);
    assert.equal(body.data.importedRecords, 3);
    assert.equal(body.data.duplicateRecords, 0);
    assert.ok(body.data.batchId);
    assert.ok(body.data.analysis);
    assert.equal(body.data.analysis.summary.totalComplaints, 3);

    createdBatchId = body.data.batchId;
  });

  test('POST /api/datasets/upload prevents duplicate records when importing overlapping batch', async () => {
    // Re-upload the exact same CSV with CMP-101, CMP-102 plus one new record CMP-104
    const csvContent = `id,store,timestamp,rating,details,asset\nCMP-101,TEST-STR-01,2026-10-15T09:00:00Z,1,Deep freezer unit is completely off,freezer-01\nCMP-102,TEST-STR-01,2026-10-15T10:00:00Z,2,Billing counter scanner is slow,pos-01\nCMP-104,TEST-STR-01,2026-10-15T12:00:00Z,2,Organic vegetables out of stock on shelf,shelf-v01\n`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'oct_complaints_supplement.csv');
    formData.append(
      'columnMapping',
      JSON.stringify({
        id: 'id',
        storeId: 'store',
        timestamp: 'timestamp',
        rating: 'rating',
        text: 'details',
        itemOrAssetId: 'asset',
      })
    );

    const res = await fetch(`${getBaseUrl()}/api/datasets/upload`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.totalRecords, 3);
    assert.equal(body.data.importedRecords, 1); // Only CMP-104 imported
    assert.equal(body.data.duplicateRecords, 2); // CMP-101 and CMP-102 detected as duplicates
  });

  test('GET /api/datasets returns list of imported batches', async () => {
    const res = await fetch(`${getBaseUrl()}/api/datasets`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 2);
    const found = body.data.find((b) => b.id === createdBatchId);
    assert.ok(found);
    assert.equal(found.filename, 'oct_complaints.csv');
    assert.equal(found.importedRecords, 3);
  });

  test('GET /api/datasets/:id returns batch details and Sanjay priority analysis', async () => {
    const res = await fetch(`${getBaseUrl()}/api/datasets/${createdBatchId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, createdBatchId);
    assert.equal(body.data.importedRecords, 3);
    assert.ok(body.data.analysis);
    assert.equal(body.data.analysis.summary.totalComplaints, 3);
  });

  test('GET /api/analytics/priority-trends filters specifically by batchId', async () => {
    const res = await fetch(`${getBaseUrl()}/api/analytics/priority-trends?batchId=${createdBatchId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.filters.batchId, createdBatchId);
    assert.equal(body.data.metadata.totalInputRecords, 3);
    assert.equal(body.data.summary.totalComplaints, 3);
  });

  test('GET /api/dashboard/overview filters metrics by batchId', async () => {
    const res = await fetch(`${getBaseUrl()}/api/dashboard/overview?batchId=${createdBatchId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.batchId, createdBatchId);
    assert.equal(body.data.metrics.totalFeedback, 3);
  });

  test('Reset Demo preserves imported datasets and official provenance records', async () => {
    // Perform demo reset
    const resetRes = await fetch(`${getBaseUrl()}/api/settings/reset-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preserveManualAndImported: true }),
    });
    assert.equal(resetRes.status, 200);

    // Verify created batch still exists
    const batchRes = await fetch(`${getBaseUrl()}/api/datasets/${createdBatchId}`);
    assert.equal(batchRes.status, 200);
    const batchBody = await batchRes.json();
    assert.equal(batchBody.data.id, createdBatchId);

    // Verify feedback from this batch was not wiped
    const fbRes = await fetch(`${getBaseUrl()}/api/feedback?batchId=${createdBatchId}`);
    assert.equal(fbRes.status, 200);
    const fbBody = await fbRes.json();
    assert.equal(fbBody.data.length, 3);
  });
});
