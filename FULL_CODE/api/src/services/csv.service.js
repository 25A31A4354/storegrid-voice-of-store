const { Readable } = require('stream');
const csvParser = require('csv-parser');
const db = require('../db');
const feedbackService = require('./feedback.service');
const storeService = require('./store.service');
const config = require('../config');
const { PROVENANCES } = require('../constants/enums');

/**
 * Normalizes CSV row keys to standard camelCase/snake_case
 */
function normalizeRow(rawRow) {
  const normalized = {};
  for (const key of Object.keys(rawRow)) {
    const cleanKey = key
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    normalized[cleanKey] = (rawRow[key] || '').trim();
  }

  return {
    text:
      normalized.text || normalized.feedback || normalized.complaint || normalized.review || normalized.message || '',
    storeCode: normalized.store_code || normalized.store_id || normalized.store || normalized.store_number || '',
    sourceType: normalized.source_type || normalized.source || normalized.channel || 'CUSTOMER_REVIEW',
    timestamp: normalized.timestamp || normalized.date || normalized.created_at || new Date().toISOString(),
    rating: normalized.rating ? parseInt(normalized.rating, 10) : null,
    language: normalized.language || normalized.lang || 'en',
    category: normalized.category || normalized.detected_category || null,
    sentiment: normalized.sentiment || null,
    provenance: normalized.provenance || PROVENANCES.SYNTHETIC_DEMO,
    customerIdentifier: normalized.customer_identifier || normalized.customer_id || normalized.phone || null,
    storeName: normalized.store_name || null,
    region: normalized.region || null,
    city: normalized.city || null,
  };
}

/**
 * Parse and process CSV content from a stream or buffer
 */
async function parseAndImportCsv(streamOrBuffer, options = {}) {
  const defaultProvenance = options.provenance || PROVENANCES.SYNTHETIC_DEMO;
  const maxRecords = config.maxCsvRecords;

  const stream = Buffer.isBuffer(streamOrBuffer)
    ? Readable.from(streamOrBuffer.toString('utf-8'))
    : typeof streamOrBuffer === 'string'
      ? Readable.from(streamOrBuffer)
      : streamOrBuffer;

  const rows = [];
  const errors = [];
  let rowCount = 0;

  await new Promise((resolve, reject) => {
    stream
      .pipe(csvParser({ skipEmptyLines: true, trim: true }))
      .on('data', (data) => {
        rowCount++;
        if (rowCount > maxRecords) {
          errors.push({
            row: rowCount,
            error: `Exceeded maximum CSV record limit of ${maxRecords} rows.`,
          });
          return;
        }
        rows.push({ index: rowCount, data });
      })
      .on('end', resolve)
      .on('error', reject);
  });

  const imported = [];
  let skippedCount = 0;

  for (const item of rows) {
    const parsed = normalizeRow(item.data);

    if (!parsed.text || parsed.text.length < 3) {
      errors.push({ row: item.index, error: 'Feedback text is missing or too short (minimum 3 characters).' });
      continue;
    }

    if (!parsed.storeCode) {
      errors.push({ row: item.index, error: 'Store identifier (store_code or store_id) is required.' });
      continue;
    }

    try {
      // Find or auto-provision store if unknown
      const store = await storeService.findOrCreateStore({
        storeIdOrCode: parsed.storeCode,
        defaultName: parsed.storeName,
        region: parsed.region,
        city: parsed.city,
      });

      const normalizedTs = parsed.timestamp ? new Date(parsed.timestamp).toISOString() : new Date().toISOString();

      // If duplicate checking is requested, check if record already exists
      if (options.skipDuplicates) {
        const existingRes = await db.query(
          'SELECT id FROM feedback WHERE store_id = $1 AND text = $2 AND (timestamp = $3 OR timestamp = $4) LIMIT 1',
          [store.id, parsed.text, parsed.timestamp, normalizedTs]
        );
        if (existingRes.rows.length > 0) {
          skippedCount++;
          continue;
        }
      }

      const feedbackRecord = await feedbackService.createFeedback({
        storeId: store.id,
        text: parsed.text,
        sourceType: parsed.sourceType,
        timestamp: normalizedTs,
        rating: parsed.rating,
        language: parsed.language,
        category: parsed.category,
        sentiment: parsed.sentiment,
        provenance: parsed.provenance || defaultProvenance,
        customerIdentifier: parsed.customerIdentifier,
      });

      imported.push(feedbackRecord);
    } catch (err) {
      errors.push({ row: item.index, error: `Import failed: ${err.message}` });
    }
  }

  return {
    totalProcessed: rows.length,
    importedCount: imported.length,
    skippedCount,
    failedCount: errors.length,
    sampleImported: imported.slice(0, 5),
    errors,
  };
}

module.exports = {
  parseAndImportCsv,
  normalizeRow,
};
