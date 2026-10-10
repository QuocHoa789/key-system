import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

class SQLiteAdapter {
  constructor(file) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); this.db = new Database(file); this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.db.exec(schema); }
  get(sql, params={}) { return this.db.prepare(sql).get(params); }
  all(sql, params={}) { return this.db.prepare(sql).all(params); }
  run(sql, params={}) { return this.db.prepare(sql).run(params); }
  transaction(fn) { return this.db.transaction(fn)(); }
  close() { this.db.close(); }
}
class PostgresAdapter {
  constructor(url) { this.pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30000, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined }); }
  async init() { await this.pool.query(schema.replaceAll('TEXT PRIMARY KEY', 'TEXT PRIMARY KEY').replaceAll('INTEGER NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0')); }
  async get(sql, params={}) { const q = bindPg(sql, params); return (await this.pool.query(q.text, q.values)).rows[0]; }
  async all(sql, params={}) { const q = bindPg(sql, params); return (await this.pool.query(q.text, q.values)).rows; }
  async run(sql, params={}) { const q = bindPg(sql, params); return this.pool.query(q.text, q.values); }
  async transaction(fn) { const client = await this.pool.connect(); try { await client.query('BEGIN'); const result = await fn({ get: async (s,p={}) => (await client.query(bindPg(s,p).text, bindPg(s,p).values)).rows[0], all: async (s,p={}) => (await client.query(bindPg(s,p).text, bindPg(s,p).values)).rows, run: async (s,p={}) => client.query(bindPg(s,p).text, bindPg(s,p).values) }); await client.query('COMMIT'); return result; } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } }
}
function bindPg(sql, params) { const values=[]; const text=sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_,k)=>{ values.push(params[k]); return `$${values.length}`; }); return {text,values}; }
export const db = process.env.DB_DRIVER === 'postgres' ? new PostgresAdapter(process.env.DATABASE_URL) : new SQLiteAdapter(process.env.SQLITE_PATH || './data/key-system.sqlite');
export { now, id };
