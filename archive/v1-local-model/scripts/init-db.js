// scripts/init-db.js — Initialize local SQLite database from schema.sql
const fs = require('fs');
const path = require('path');

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'hrc.db');
const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`Initializing database at ${dbPath}`);

async function init() {
  // Load sql.js — it exports an async initializer
  const initSqlJs = require('sql.js');
  
  // Initialize with wasm file location (synchronous call returns a promise)
  const SQL = await initSqlJs({ 
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file) 
  });

  console.log('SQL type:', typeof SQL);
  console.log('SQL keys:', Object.keys(SQL || {}));

  // Create new database instance
  const Database = SQL.Database;
  let sql;
  try {
    const existingData = fs.readFileSync(dbPath);
    sql = new Database(existingData);
  } catch (e) {
    console.log('Creating fresh DB:', e.message);
    sql = new Database();
  }

  // Enable WAL mode
  sql.exec('PRAGMA journal_mode=WAL;');

  // Read and execute schema
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const statements = schema.split(';').filter(s => s.trim().length > 0);

  let count = 0;
  for (const stmt of statements) {
    try {
      sql.exec(stmt + ';');
      count++;
    } catch (err) {
      if (!String(err).message.includes('already exists')) {
        console.error(`Error executing statement ${count}:`, err.message);
      }
    }
  }

  // Save to disk
  const data = sql.export();
  fs.writeFileSync(dbPath, Buffer.from(data));

  console.log(`Schema applied: ${count} statements executed`);
}

init().catch(console.error);
