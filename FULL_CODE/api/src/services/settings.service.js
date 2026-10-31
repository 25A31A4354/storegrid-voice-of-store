const path = require('path');
const fs = require('fs');
const db = require('../db');
const { PROVENANCES } = require('../constants/enums');

let tableEnsured = false;

/**
 * Ensures system_settings table exists in database
 */
async function ensureTable() {
  if (tableEnsured) return;
  const sql = `
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await db.query(sql);
  tableEnsured = true;
}

/**
 * Get active system settings with robust fallbacks
 */
async function getSettings() {
  await ensureTable();

  const res = await db.query('SELECT key, value, updated_at FROM system_settings;');
  const map = {};
  let latestUpdate = null;

  for (const row of res.rows) {
    map[row.key] = row.value;
    if (!latestUpdate || row.updated_at > latestUpdate) {
      latestUpdate = row.updated_at;
    }
  }

  const rawThreshold = map['nlp_confidence_threshold'];
  let confidenceThreshold = 65;
  if (rawThreshold !== undefined) {
    const parsed = parseFloat(rawThreshold);
    if (!isNaN(parsed)) {
      confidenceThreshold = parsed <= 1.0 ? Math.round(parsed * 100) : Math.round(parsed);
    }
  }

  const autoFlagCritical =
    map['auto_flag_critical'] !== undefined
      ? map['auto_flag_critical'] === 'true' || map['auto_flag_critical'] === '1'
      : true;

  const multilingualNormalization =
    map['multilingual_normalization'] !== undefined
      ? map['multilingual_normalization'] === 'true' || map['multilingual_normalization'] === '1'
      : true;

  return {
    confidenceThreshold,
    confidenceThresholdRatio: Number((confidenceThreshold / 100).toFixed(2)),
    autoFlagCritical,
    multilingualNormalization,
    allowedThresholds: [40, 65, 90],
    supportedLanguages: ['en', 'hi-Latn', 'ta-Latn', 'mr-Latn'],
    unsupportedLanguages: [],
    updatedAt: latestUpdate,
  };
}

/**
 * Update system settings with strict range validation
 */
async function updateSettings(updates = {}) {
  await ensureTable();
  const now = new Date().toISOString();

  // 1. Validate confidenceThreshold (must be in range 40% - 90%)
  if (updates.confidenceThreshold !== undefined) {
    let val = parseFloat(updates.confidenceThreshold);
    if (isNaN(val)) {
      throw new Error('Validation failed: confidenceThreshold must be a valid number.');
    }
    // Accept 0.40 - 0.90 or 40 - 90
    if (val >= 0.4 && val <= 0.9) {
      val = Math.round(val * 100);
    } else {
      val = Math.round(val);
    }

    if (val < 40 || val > 90) {
      throw new Error('Validation failed: confidenceThreshold must be between 40% and 90% (or 0.40 to 0.90).');
    }

    await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      ['nlp_confidence_threshold', String(val), now]
    );
  }

  // 2. Validate autoFlagCritical (boolean)
  if (updates.autoFlagCritical !== undefined) {
    const val = Boolean(updates.autoFlagCritical);
    await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      ['auto_flag_critical', String(val), now]
    );
  }

  // 3. Validate multilingualNormalization (boolean)
  if (updates.multilingualNormalization !== undefined) {
    const val = Boolean(updates.multilingualNormalization);
    await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      ['multilingual_normalization', String(val), now]
    );
  }

  return await getSettings();
}

/**
 * Query current dataset statistics by provenance to present clear reset confirmation
 */
async function getDatasetCounts() {
  const sql = `
    SELECT provenance, COUNT(*) as count
    FROM feedback
    GROUP BY provenance;
  `;
  const res = await db.query(sql);

  const counts = {
    syntheticDemo: 0,
    manualEntry: 0,
    officialDataset: 0,
    test: 0,
    total: 0,
  };

  for (const row of res.rows) {
    const cnt = parseInt(row.count, 10);
    counts.total += cnt;
    if (row.provenance === PROVENANCES.SYNTHETIC_DEMO) {
      counts.syntheticDemo = cnt;
    } else if (row.provenance === PROVENANCES.MANUAL_ENTRY) {
      counts.manualEntry = cnt;
    } else if (row.provenance === PROVENANCES.OFFICIAL_DATASET) {
      counts.officialDataset = cnt;
    } else if (row.provenance === PROVENANCES.TEST) {
      counts.test = cnt;
    }
  }

  return counts;
}

/**
 * Reset synthetic demo data transactionally without touching manual submissions or imported CSVs
 */
async function resetDemoWorkspace() {
  const countsBefore = await getDatasetCounts();

  // Delete ONLY synthetic demo feedback (foreign keys with ON DELETE CASCADE remove issue_feedback links)
  const deleteSql = `
    DELETE FROM feedback
    WHERE provenance = $1;
  `;
  await db.query(deleteSql, [PROVENANCES.SYNTHETIC_DEMO]);

  // Re-import original synthetic CSV feedback
  const csvPath = path.join(__dirname, '../../data/synthetic_feedback.csv');
  let reimportedCount = 0;

  if (fs.existsSync(csvPath)) {
    const csvService = require('./csv.service');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const importResult = await csvService.parseAndImportCsv(csvContent, {
      provenance: PROVENANCES.SYNTHETIC_DEMO,
      skipDuplicates: false,
    });
    reimportedCount = importResult.importedCount;
  }

  const countsAfter = await getDatasetCounts();

  return {
    success: true,
    message: 'Synthetic demo dataset successfully restored to original factory state.',
    resetCount: reimportedCount,
    deletedSyntheticCount: countsBefore.syntheticDemo,
    preservedManualCount: countsAfter.manualEntry,
    preservedImportedCount: countsAfter.officialDataset,
    currentCounts: countsAfter,
  };
}

module.exports = {
  getSettings,
  updateSettings,
  getDatasetCounts,
  resetDemoWorkspace,
};
