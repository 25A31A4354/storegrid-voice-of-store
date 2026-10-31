const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function migrate() {
  console.log('--- StoreGrid Database Migration Runner ---');
  await db.initDb();

  const status = db.getDbStatus();
  console.log(`Target Database Mode: ${status.mode.toUpperCase()}`);

  if (status.mode === 'postgresql') {
    console.log('Applying PostgreSQL initial schema migration (scripts/init-postgres.sql)...');
    const sqlPath = path.join(__dirname, 'init-postgres.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    await db.query(sql);
    console.log('PostgreSQL schema applied successfully.');
  } else {
    console.log('Applying SQLite fallback schema migration (src/db/schema-sqlite.sql)...');
    const sqlPath = path.join(__dirname, '../src/db/schema-sqlite.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    await db.query(sql);
    console.log('SQLite fallback schema verified and ready.');
  }

  await db.closeDb();
  console.log('Migration finished.');
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = migrate;
