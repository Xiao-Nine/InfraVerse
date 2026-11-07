import { all, get, run } from './db.js';
import { now } from './config.js';

/**
 * 写入操作记录。审计失败不应影响主流程。
 * detail 中不得包含密码等敏感字段。
 */
export function writeAudit(ctx, { action, entityType = null, entityId = null, summary = '', detail = null }) {
  try {
    const user = ctx?.user || null;
    run(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, summary, detail, ip, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user?.id ?? null,
      user?.username ?? ctx?.username ?? 'system',
      action,
      entityType,
      entityId === null || entityId === undefined ? null : String(entityId),
      summary,
      detail ? JSON.stringify(detail) : null,
      ctx?.ip || null,
      ctx?.source || 'web',
      now(),
    );
  } catch (error) {
    console.error('[audit] failed:', error.message);
  }
}

export function listAudit({ q, action, entityType, username, source, limit = 50, offset = 0 }) {
  const where = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where.push('(summary LIKE ? OR detail LIKE ? OR entity_id LIKE ? OR username LIKE ?)');
    params.push(like, like, like, like);
  }
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (entityType) {
    where.push('entity_type = ?');
    params.push(entityType);
  }
  if (username) {
    where.push('username = ?');
    params.push(username);
  }
  if (source) {
    where.push('source = ?');
    params.push(source);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) AS n FROM audit_logs ${clause}`, ...params)?.n || 0;
  const rows = all(
    `SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    ...params,
    Math.min(Number(limit) || 50, 500),
    Number(offset) || 0,
  ).map((row) => ({
    ...row,
    detail: row.detail ? safeParse(row.detail) : null,
  }));
  return { items: rows, total, limit, offset };
}

export function auditActions() {
  return all('SELECT DISTINCT action FROM audit_logs ORDER BY action').map((r) => r.action);
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}