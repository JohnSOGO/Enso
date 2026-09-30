// src/lib/db.ts — Database abstraction layer
// Shared interface for both local SQLite and Cloudflare D1.
// All API code uses `db` — never the concrete class.
// Swapping environments is a one-line config change.

import type { DB as D1Database } from 'cloudflare:workers';

export interface DB {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// --- Local implementation (sql.js — pure JS SQLite) ---

let sqlDB: any = null;
let sqlInstance: any = null;

/** Initialize the local database from a file or create new */
export async function initSQLite(path: string): Promise<void> {
  const SQLModule = await import('sql.js');
  const initSQL = SQLModule.default || SQLModule;
  
  const wasmPath = require('path').join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQLConstructor = await initSQL({ locateFile: () => wasmPath });
  const Database = SQLConstructor.Database;

  // Create new database instance
  let sql;
  try {
    const fs = require('fs').promises;
    const existingData = await fs.readFile(path);
    sql = new Database(existingData);
  } catch {
    sql = new Database();
  }

  // Enable WAL mode
  sql.exec('PRAGMA journal_mode=WAL;');

  sqlInstance = sql;
  sqlDB = sql;
}

export class SQLiteDB implements DB {
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!sqlDB) throw new Error('SQLite not initialized. Call initSQLite() first.');
    
    const stmt = sqlDB.prepare(sql);
    if (params) {
      for (let i = 0; i < params.length; i++) {
        stmt.bind(i + 1, params[i]);
      }
    }
    
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (!sqlDB) throw new Error('SQLite not initialized.');
    
    try {
      const stmt = sqlDB.prepare(sql);
      if (params) {
        for (let i = 0; i < params.length; i++) {
          stmt.bind(i + 1, params[i]);
        }
      }
      stmt.step();
      stmt.free();
    } catch (err: any) {
      // Ignore "no such table" errors during init
      if (!String(err).message.includes('no such table')) throw err;
    }
  }

  async begin(): Promise<void> {
    if (!sqlDB) throw new Error('SQLite not initialized.');
    sqlDB.exec('BEGIN');
  }

  async commit(): Promise<void> {
    if (!sqlDB) throw new Error('SQLite not initialized.');
    // Save state to disk on commit for persistence
    const data = sqlInstance.export();
    const fs = require('fs').promises;
    await fs.writeFile(process.env.SQLITE_PATH || './data/hrc.db', Buffer.from(data));
  }

  async rollback(): Promise<void> {
    if (!sqlDB) throw new Error('SQLite not initialized.');
    sqlDB.exec('ROLLBACK');
  }
}

// --- Cloud implementation (D1) ---

export class D1DB implements DB {
  constructor(private stmt: D1Database) {}

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.stmt.prepare(sql).bind(...(params ?? [])).all();
    return result as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.stmt.prepare(sql).bind(...(params ?? [])).run();
  }

  async begin(): Promise<void> {
    await this.stmt.exec('BEGIN');
  }

  async commit(): Promise<void> {
    // D1 auto-commits; no-op
  }

  async rollback(): Promise<void> {
    await this.stmt.exec('ROLLBACK');
  }
}

// --- Factory: picks the right implementation based on environment ---

let _db: DB | null = null;

export function getDB(): DB {
  if (_db) return _db;

  // Check if we're in a Cloudflare Worker (D1 binding is available)
  const hasD1Binding = typeof process !== 'undefined' && process.env.D1_HRC_BINDING;
  
  if (hasD1Binding || globalThis['D1_HRC']) {
    _db = new D1DB(globalThis['D1_HRC'] as D1Database);
    return _db;
  }

  // Local dev: use SQLite directly (caller must await initSQLite first)
  if (sqlDB) {
    _db = new SQLiteDB();
    return _db;
  }

  throw new Error('SQLite not initialized. Call initSQLite() before getDB().');
}
