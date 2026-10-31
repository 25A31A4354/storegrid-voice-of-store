const crypto = require('crypto');
const db = require('../db');

/**
 * Format store row from database
 */
function formatStore(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    region: row.region || null,
    city: row.city || null,
    address: row.address || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new store record
 */
async function createStore({ code, name, region, city, address }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO stores (id, code, name, region, city, address, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  const res = await db.query(sql, [
    id,
    code.trim(),
    name.trim(),
    region || null,
    city || null,
    address || null,
    1,
    now,
    now,
  ]);
  return formatStore(res.rows[0]);
}

/**
 * Find store by UUID
 */
async function getStoreById(id) {
  const sql = `SELECT * FROM stores WHERE id = $1 LIMIT 1;`;
  const res = await db.query(sql, [id]);
  return formatStore(res.rows[0]);
}

/**
 * Find store by unique Store Code (e.g. STR-HYD-001)
 */
async function getStoreByCode(code) {
  if (!code) return null;
  const sql = `SELECT * FROM stores WHERE UPPER(code) = UPPER($1) LIMIT 1;`;
  const res = await db.query(sql, [code.trim()]);
  return formatStore(res.rows[0]);
}

/**
 * Find existing store by ID or Code, or auto-create it if not found (used during CSV import)
 */
async function findOrCreateStore({ storeIdOrCode, defaultName, region, city }) {
  if (!storeIdOrCode) {
    throw new Error('storeIdOrCode is required');
  }

  // Check if it's a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeIdOrCode);
  if (isUuid) {
    const store = await getStoreById(storeIdOrCode);
    if (store) return store;
  }

  // Check by code
  const byCode = await getStoreByCode(storeIdOrCode);
  if (byCode) return byCode;

  // Auto-provision store
  const code = storeIdOrCode.toUpperCase().trim();
  const name = defaultName || `Store ${code}`;
  return await createStore({
    code,
    name,
    region: region || 'South Region',
    city: city || 'Unspecified City',
  });
}

/**
 * List all active stores
 */
async function listStores() {
  const sql = `SELECT * FROM stores WHERE is_active = 1 ORDER BY code ASC;`;
  const res = await db.query(sql);
  return res.rows.map(formatStore);
}

module.exports = {
  createStore,
  getStoreById,
  getStoreByCode,
  findOrCreateStore,
  listStores,
  formatStore,
};
