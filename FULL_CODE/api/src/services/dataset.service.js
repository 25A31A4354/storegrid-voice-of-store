const crypto = require('crypto');
const { Readable } = require('stream');
const csvParser = require('csv-parser');
const ExcelJS = require('exceljs');
const db = require('../db');
const logger = require('../logger');
const storeService = require('./store.service');
const feedbackService = require('./feedback.service');
const { analyzeComplaints } = require('../../priority-trends');
const { VALID_CATEGORIES, PROVENANCES } = require('../constants/enums');

/**
 * Ensures dataset_batches table exists in database
 */
async function ensureDatasetTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS dataset_batches (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      format TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      total_records INTEGER NOT NULL DEFAULT 0,
      imported_records INTEGER NOT NULL DEFAULT 0,
      skipped_records INTEGER NOT NULL DEFAULT 0,
      duplicate_records INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      column_mapping TEXT,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await db.query(sql);
}

/** An error caused by the uploaded file itself; the controllers answer it with HTTP 400. */
function invalidFile(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/** Rows of a CSV file as objects keyed by the header row. */
function readCsvRows(buffer) {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, ''); // Excel adds a byte-order mark to CSV exports
  // Tab- and semicolon-separated exports are common too; pick whichever separator the header line uses most.
  const headerLine = text.split('\n', 1)[0];
  const separator = [',', '\t', ';'].reduce((best, sep) =>
    headerLine.split(sep).length > headerLine.split(best).length ? sep : best
  );
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(text)
      .pipe(csvParser({ separator }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/** Excel cell as plain text: dates as ISO strings, formulas and rich text as their displayed text. */
function cellText(cell) {
  const { value } = cell;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'object' ? cell.text : String(value);
}

/** Rows of the first worksheet of an .xlsx file, keyed by its header row. */
async function readExcelRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook contains no sheets.');

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell).trim();
  });
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    headers.forEach((header, col) => {
      if (header) record[header] = cellText(row.getCell(col));
    });
    rows.push(record);
  });
  return rows;
}

/** Parses an uploaded CSV, .xlsx or JSON file into an array of row objects. */
async function parseFileBuffer(buffer, filename = '', mimetype = '') {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith('.json') || mimetype.includes('json')) {
    const text = buffer.toString('utf-8');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw invalidFile(`Malformed JSON file: ${err.message}`);
    }

    let rows = [];
    if (Array.isArray(parsed)) {
      rows = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.data)) rows = parsed.data;
      else if (Array.isArray(parsed.complaints)) rows = parsed.complaints;
      else if (Array.isArray(parsed.feedback)) rows = parsed.feedback;
      else if (Array.isArray(parsed.records)) rows = parsed.records;
      else {
        throw invalidFile(
          'JSON object must contain an array under root, "data", "complaints", "feedback", or "records".'
        );
      }
    } else {
      throw invalidFile('JSON payload must be an array of records.');
    }

    return { rows, format: 'JSON' };
  }

  if (lowerName.endsWith('.xls')) {
    throw invalidFile('Legacy .xls files are not supported. Save the file as .xlsx or .csv and upload it again.');
  }

  if (lowerName.endsWith('.xlsx')) {
    try {
      return { rows: await readExcelRows(buffer), format: 'XLSX' };
    } catch (err) {
      throw invalidFile(`Unable to parse Excel file: ${err.message}`);
    }
  }

  try {
    return { rows: await readCsvRows(buffer), format: 'CSV' };
  } catch (err) {
    throw invalidFile(`Unable to parse CSV file: ${err.message}`);
  }
}

/**
 * Auto-detect and suggest column mappings for StoreGrid fields
 */
function detectSuggestedMapping(columns = []) {
  const mapping = {
    id: '',
    storeCode: '',
    text: '',
    category: '',
    timestamp: '',
    status: '',
    rating: '',
    itemOrAssetId: '',
    language: '',
  };

  for (const col of columns) {
    const c = String(col).trim().toLowerCase();

    // Feedback text (most important)
    if (
      !mapping.text &&
      (c === 'text' ||
        c === 'description' ||
        c === 'details' ||
        c === 'complaint' ||
        c === 'feedback' ||
        c === 'message' ||
        c === 'comment')
    ) {
      mapping.text = col;
    }

    // Store ID / Code
    if (
      !mapping.storeCode &&
      (c === 'store_code' ||
        c === 'storecode' ||
        c === 'store_id' ||
        c === 'storeid' ||
        c === 'store' ||
        c === 'branch')
    ) {
      mapping.storeCode = col;
      mapping.storeId = col;
    }

    // Ticket / Feedback ID
    if (
      !mapping.id &&
      (c === 'id' ||
        c === 'ticket_id' ||
        c === 'complaint_id' ||
        c === 'feedback_id' ||
        c === 'complaintid' ||
        c === 'ticketid')
    ) {
      mapping.id = col;
    }

    // Category
    if (
      !mapping.category &&
      (c === 'category' || c === 'pillar' || c === 'predicted_category' || c === 'issue_type' || c === 'classification')
    ) {
      mapping.category = col;
    }

    // Timestamp
    if (
      !mapping.timestamp &&
      (c === 'timestamp' || c === 'created_at' || c === 'createdat' || c === 'date' || c === 'time' || c === 'datetime')
    ) {
      mapping.timestamp = col;
    }

    // Status
    if (!mapping.status && (c === 'status' || c === 'state')) {
      mapping.status = col;
    }

    // Rating
    if (!mapping.rating && (c === 'rating' || c === 'score' || c === 'stars')) {
      mapping.rating = col;
    }

    // Asset / Item ID
    if (
      !mapping.itemOrAssetId &&
      (c === 'item_id' ||
        c === 'itemid' ||
        c === 'asset_id' ||
        c === 'assetid' ||
        c === 'item_or_asset_id' ||
        c === 'sku')
    ) {
      mapping.itemOrAssetId = col;
    }

    // Language
    if (!mapping.language && (c === 'language' || c === 'lang')) {
      mapping.language = col;
    }
  }

  if (!mapping.storeId && mapping.storeCode) {
    mapping.storeId = mapping.storeCode;
  }

  return mapping;
}

/**
 * Preview dataset: parses file and returns metadata, columns, suggestions, and first 10-20 rows
 */
async function previewDataset({ buffer, filename, mimetype }) {
  if (!buffer || buffer.length === 0) {
    throw invalidFile('File payload is empty.');
  }

  const { rows, format } = await parseFileBuffer(buffer, filename, mimetype);

  if (!rows || rows.length === 0) {
    throw invalidFile('Uploaded file contains no data rows.');
  }

  // Extract all distinct column keys from sample rows
  const colSet = new Set();
  const sampleLimit = Math.min(rows.length, 50);
  for (let i = 0; i < sampleLimit; i++) {
    const row = rows[i];
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((k) => colSet.add(k));
    }
  }
  const availableColumns = Array.from(colSet);

  const suggestedMapping = detectSuggestedMapping(availableColumns);
  const previewRows = rows.slice(0, 20);
  const normFormat = format === 'XLSX' ? 'EXCEL' : format;

  return {
    filename: filename || 'uploaded_file',
    fileSizeBytes: buffer.length,
    format: normFormat,
    rawFormat: format,
    totalRecords: rows.length,
    totalRows: rows.length,
    availableColumns,
    headers: availableColumns,
    suggestedMapping,
    previewRows,
  };
}

/**
 * Import dataset into database with validation, auto-provisioning, and Sanjay's priority-trends analytics
 */
async function importDataset({ buffer, filename, mimetype, columnMapping = {}, batchId = null }) {
  await ensureDatasetTable();

  if (!buffer || buffer.length === 0) {
    throw invalidFile('File payload is empty.');
  }

  const { rows, format } = await parseFileBuffer(buffer, filename, mimetype);

  if (!rows || rows.length === 0) {
    throw invalidFile('File contains no records to import.');
  }

  // Derive column mappings (fallback to auto-detection if partial)
  const columns = rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [];
  const autoMapping = detectSuggestedMapping(columns);

  const userSpecifiedText = columnMapping && columnMapping.text;
  const autoDetectedText = autoMapping.text;
  const targetTextCol = userSpecifiedText || autoDetectedText;

  if (!targetTextCol || !columns.includes(targetTextCol)) {
    const err = new Error("Column mapping must specify a source column for 'text' (feedback details).");
    err.statusCode = 400;
    throw err;
  }

  const finalMapping = {
    ...autoMapping,
    ...columnMapping,
    text: targetTextCol,
  };

  const finalBatchId = batchId || `BATCH-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

  const now = new Date().toISOString();

  // Insert initial processing record into dataset_batches
  const insertBatchSql = `
    INSERT INTO dataset_batches (
      id, filename, format, file_size_bytes, total_records,
      imported_records, skipped_records, duplicate_records, error_count,
      column_mapping, status, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 0, $6, 'PROCESSING', $7, $8)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at;
  `;
  await db.query(insertBatchSql, [
    finalBatchId,
    filename || 'dataset_upload',
    format,
    buffer.length,
    rows.length,
    JSON.stringify(finalMapping),
    now,
    now,
  ]);

  const errors = [];
  const importedFeedbackIds = [];
  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const rawRow = rows[idx];
    const rowNum = idx + 1;

    // 1. Extract text (mandatory)
    const textField = finalMapping.text;
    const rawText = textField && rawRow[textField] !== undefined ? String(rawRow[textField]).trim() : '';

    if (!rawText || rawText.length < 3) {
      errors.push({
        row: rowNum,
        error: `Row ${rowNum}: Feedback text is missing or too short (minimum 3 characters).`,
      });
      continue;
    }

    // 2. Extract record ID
    const idField = finalMapping.id;
    const explicitId =
      idField && rawRow[idField] !== undefined && String(rawRow[idField]).trim() !== ''
        ? String(rawRow[idField]).trim()
        : null;

    // Check duplicate ID if explicit ID provided
    if (explicitId) {
      const dupCheck = await db.query('SELECT id FROM feedback WHERE id = $1 LIMIT 1', [explicitId]);
      if (dupCheck.rows.length > 0) {
        duplicateCount++;
        skippedCount++;
        continue;
      }
    }

    // 3. Extract store code / store ID
    const storeField = finalMapping.storeCode;
    let rawStoreCode = storeField && rawRow[storeField] !== undefined ? String(rawRow[storeField]).trim() : '';
    if (!rawStoreCode) {
      rawStoreCode = 'STR-HYD-001'; // Safe default retail store
    }

    // Auto-provision store if unknown
    let resolvedStore;
    try {
      // Use store_name / city / region columns when the file carries them (the R5 demo slice does).
      const cell = (name) => String(rawRow[name] ?? '').trim() || undefined;
      resolvedStore = await storeService.findOrCreateStore({
        storeIdOrCode: rawStoreCode,
        defaultName: cell('store_name') || `Store ${rawStoreCode}`,
        region: cell('region') || 'Retail Network',
        city: cell('city') || 'Unspecified City',
      });
    } catch (err) {
      logger.warn({ store: rawStoreCode, err: err.message }, 'Store could not be resolved, using the default store');
      resolvedStore = await storeService.findOrCreateStore({
        storeIdOrCode: 'STR-HYD-001',
        defaultName: 'Store Begumpet Central',
        region: 'South',
        city: 'Hyderabad',
      });
    }

    // 4. Timestamp
    const tsField = finalMapping.timestamp;
    let feedbackTimestamp = now;
    if (tsField && rawRow[tsField]) {
      const parsedTs = new Date(rawRow[tsField]);
      if (!isNaN(parsedTs.getTime())) {
        feedbackTimestamp = parsedTs.toISOString();
      }
    }

    // 5. Rating
    const ratingField = finalMapping.rating;
    let safeRating = null;
    if (ratingField && rawRow[ratingField] !== undefined && rawRow[ratingField] !== '') {
      const parsedNum = parseInt(rawRow[ratingField], 10);
      if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 5) {
        safeRating = parsedNum;
      }
    }

    // 6. Category
    const catField = finalMapping.category;
    let explicitCategory = null;
    if (catField && rawRow[catField]) {
      const normalizedCat = String(rawRow[catField]).trim().toUpperCase();
      if (VALID_CATEGORIES.includes(normalizedCat)) {
        explicitCategory = normalizedCat;
      }
    }

    // 7. Status & Asset ID
    const statusField = finalMapping.status;
    const rawStatus = statusField && rawRow[statusField] ? String(rawRow[statusField]).trim().toUpperCase() : 'OPEN';
    const safeStatus = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(rawStatus) ? rawStatus : 'OPEN';

    const assetField = finalMapping.itemOrAssetId;
    const itemOrAssetId = assetField && rawRow[assetField] ? String(rawRow[assetField]).trim() : null;

    const langField = finalMapping.language;
    const rawLang = langField && rawRow[langField] ? String(rawRow[langField]).trim().toLowerCase() : 'en';

    try {
      const created = await feedbackService.createFeedback({
        id: explicitId || undefined,
        storeId: resolvedStore.id,
        text: rawText,
        sourceType: 'CUSTOMER_REVIEW',
        timestamp: feedbackTimestamp,
        rating: safeRating,
        language: rawLang,
        category: explicitCategory,
        provenance: PROVENANCES.OFFICIAL_DATASET,
        batchId: finalBatchId,
        metadata: {
          batchId: finalBatchId,
          sourceFilename: filename || 'uploaded_dataset',
          itemOrAssetId: itemOrAssetId || undefined,
          status: safeStatus,
          importedAt: now,
        },
      });

      importedCount++;
      importedFeedbackIds.push(created.id);
    } catch (err) {
      errors.push({
        row: rowNum,
        error: `Import failed: ${err.message}`,
      });
    }
  }

  // Compute rich Sanjay analytics for the imported records
  let batchAnalytics = null;
  try {
    const batchFeedbackSql = `
      SELECT 
        f.id,
        s.code as store_id,
        s.name as store_name,
        f.detected_category as category,
        f.processing_status as status,
        f.timestamp as created_at,
        f.text as details,
        substr(f.text, 1, 50) as subject,
        f.metadata
      FROM feedback f
      JOIN stores s ON f.store_id = s.id
      WHERE f.batch_id = $1;
    `;
    const batchRowsRes = await db.query(batchFeedbackSql, [finalBatchId]);

    const complaintsForSanjay = batchRowsRes.rows.map((row) => {
      const meta = db.parseJsonColumn(row.metadata, {}, `feedback ${row.id} metadata`);
      return {
        id: row.id,
        storeId: row.store_id,
        category: row.category,
        status: meta?.status || 'OPEN',
        createdAt: row.created_at,
        subject: row.subject,
        details: row.details,
        itemOrAssetId: meta?.itemOrAssetId || null,
      };
    });

    batchAnalytics = analyzeComplaints(complaintsForSanjay, { referenceTime: new Date() });
  } catch (err) {
    logger.warn({ batch: finalBatchId, err: err.message }, 'Could not compute priority analytics for the batch');
  }

  // Update batch record to COMPLETED
  const updateBatchSql = `
    UPDATE dataset_batches
    SET imported_records = $1,
        skipped_records = $2,
        duplicate_records = $3,
        error_count = $4,
        status = 'COMPLETED',
        summary = $5,
        updated_at = $6
    WHERE id = $7;
  `;
  await db.query(updateBatchSql, [
    importedCount,
    skippedCount,
    duplicateCount,
    errors.length,
    batchAnalytics ? JSON.stringify(batchAnalytics.summary) : null,
    new Date().toISOString(),
    finalBatchId,
  ]);

  return {
    success: true,
    batchId: finalBatchId,
    filename: filename || 'uploaded_dataset',
    format: format === 'XLSX' ? 'EXCEL' : format,
    rawFormat: format,
    totalRecords: rows.length,
    totalProcessed: rows.length,
    importedRecords: importedCount,
    importedCount,
    duplicateRecords: duplicateCount,
    duplicateCount,
    skippedRecords: skippedCount,
    skippedCount,
    errorCount: errors.length,
    errors: errors.slice(0, 25),
    analysis: batchAnalytics,
    analytics: batchAnalytics,
  };
}

/**
 * List all dataset upload batches
 */
async function listBatches() {
  await ensureDatasetTable();
  const sql = `
    SELECT *
    FROM dataset_batches
    ORDER BY created_at DESC;
  `;
  const res = await db.query(sql);
  return res.rows.map((row) => {
    const summary = db.parseJsonColumn(row.summary, null, `batch ${row.id} summary`);
    const columnMapping = db.parseJsonColumn(row.column_mapping, null, `batch ${row.id} column mapping`);
    return {
      id: row.id,
      filename: row.filename,
      format: row.format,
      fileSizeBytes: Number(row.file_size_bytes),
      totalRecords: Number(row.total_records),
      importedRecords: Number(row.imported_records),
      skippedRecords: Number(row.skipped_records),
      duplicateRecords: Number(row.duplicate_records),
      errorCount: Number(row.error_count),
      columnMapping,
      status: row.status,
      summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Get details for a specific dataset batch
 */
async function getBatchById(batchId) {
  await ensureDatasetTable();
  const sql = `
    SELECT *
    FROM dataset_batches
    WHERE id = $1
    LIMIT 1;
  `;
  const res = await db.query(sql, [batchId]);
  if (!res.rows || res.rows.length === 0) {
    return null;
  }
  const row = res.rows[0];
  const summary = db.parseJsonColumn(row.summary, null, `batch ${row.id} summary`);
  const columnMapping = db.parseJsonColumn(row.column_mapping, null, `batch ${row.id} column mapping`);
  return {
    id: row.id,
    filename: row.filename,
    format: row.format,
    fileSizeBytes: Number(row.file_size_bytes),
    totalRecords: Number(row.total_records),
    importedRecords: Number(row.imported_records),
    skippedRecords: Number(row.skipped_records),
    duplicateRecords: Number(row.duplicate_records),
    errorCount: Number(row.error_count),
    columnMapping,
    status: row.status,
    summary,
    analysis: summary ? { summary } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  previewDataset,
  importDataset,
  listBatches,
  getBatchById,
  parseFileBuffer,
  detectSuggestedMapping,
};
