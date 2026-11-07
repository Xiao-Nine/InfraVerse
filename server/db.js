import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { config, now } from './config.js';
import { seedDatabase } from './seed.js';

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS racks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    row_label TEXT,
    col INTEGER,
    x REAL NOT NULL DEFAULT 0,
    z REAL NOT NULL DEFAULT 0,
    rotation REAL NOT NULL DEFAULT 0,
    u_height INTEGER NOT NULL DEFAULT 42,
    power_capacity TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    model TEXT,
    vendor TEXT,
    serial TEXT,
    status TEXT NOT NULL DEFAULT 'in_use',
    rack_id INTEGER REFERENCES racks(id) ON DELETE SET NULL,
    position_u INTEGER,
    u_height INTEGER NOT NULL DEFAULT 1,
    slot TEXT,
    parent_id INTEGER REFERENCES materials(id) ON DELETE RESTRICT,
    spec TEXT NOT NULL DEFAULT '{}',
    note TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
  CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
  CREATE INDEX IF NOT EXISTS idx_materials_rack ON materials(rack_id);
  CREATE INDEX IF NOT EXISTS idx_materials_parent ON materials(parent_id);

  CREATE TABLE IF NOT EXISTS server_status (
    material_id INTEGER PRIMARY KEY REFERENCES materials(id) ON DELETE CASCADE,
    power_state TEXT NOT NULL DEFAULT 'unknown',
    health TEXT NOT NULL DEFAULT 'unknown',
    cpu_pct REAL,
    mem_pct REAL,
    temp_c REAL,
    uptime_s INTEGER,
    last_seen TEXT,
    metrics TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    params TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT,
    requested_by INTEGER,
    requested_by_name TEXT,
    result TEXT,
    simulated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
  CREATE INDEX IF NOT EXISTS idx_commands_material ON commands(material_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    summary TEXT,
    detail TEXT,
    ip TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
`);

function normalize(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function all(sql, ...params) {
  const stmt = db.prepare(sql);
  return stmt.all(...params.map(normalize));
}

export function get(sql, ...params) {
  const stmt = db.prepare(sql);
  return stmt.get(...params.map(normalize));
}

export function run(sql, ...params) {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params.map(normalize));
  return { changes: Number(result.changes || 0), lastInsertRowid: Number(result.lastInsertRowid || 0) };
}

let txDepth = 0;
export function tx(fn) {
  if (txDepth > 0) return fn();
  txDepth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    txDepth--;
  }
}

export function getSetting(key) {
  return get('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// 初始化种子数据（仅首次启动；事务内二次检查，避免多进程同时初始化）
if (!getSetting('seed_version')) {
  tx(() => {
    if (getSetting('seed_version')) return;
    seedDatabase({ all, get, run, tx, getSetting, setSetting, now });
    setSetting('seed_version', '1');
    setSetting('initialized_at', now());
  });
}

export function closeDb() {
  try {
    db.close();
  } catch {
    // ignore
  }
}

export function dbStats() {
  try {
    const { size } = fs.statSync(config.dbPath);
    return { path: config.dbPath, size };
  } catch {
    return { path: config.dbPath, size: 0 };
  }
}