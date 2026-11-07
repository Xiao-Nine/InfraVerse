import jwt from 'jsonwebtoken';
import { all, get, run } from './db.js';
import { config, now } from './config.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto.js';
import { badRequest, conflict, HttpError } from './errors.js';
import { writeAudit } from './audit.js';

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
}

export function signUserToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, name: user.display_name || user.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function getUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', id);
}

export function getUserByUsername(username) {
  return get('SELECT * FROM users WHERE username = ?', username);
}

export function registerUser({ username, password, displayName }) {
  if (!config.allowRegister) throw new HttpError(403, '当前未开放注册');
  const name = String(username || '').trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(name)) {
    throw badRequest('用户名需为 3-32 位字母、数字、下划线、点或短横线');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw badRequest('密码长度需为 6-128 位');
  }
  if (getUserByUsername(name)) throw conflict('用户名已存在');
  const ts = now();
  const result = run(
    'INSERT INTO users (username, password_hash, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)',
    name,
    hashPassword(password),
    String(displayName || name).trim().slice(0, 40),
    ts,
    ts,
  );
  return getUserById(result.lastInsertRowid);
}

export function checkPassword(user, password) {
  return verifyPassword(password, user.password_hash);
}

export function markLogin(userId) {
  run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), userId);
}

export function changePassword(user, oldPassword, newPassword) {
  const row = getUserById(user.id);
  if (!row || !verifyPassword(oldPassword, row.password_hash)) throw badRequest('原密码不正确');
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
    throw badRequest('新密码长度需为 6-128 位');
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), user.id);
}

function userFromJwt(raw) {
  let payload;
  try {
    payload = jwt.verify(raw, config.jwtSecret);
  } catch {
    throw new HttpError(401, '登录已过期，请重新登录');
  }
  const user = getUserById(payload.uid);
  if (!user) throw new HttpError(401, '用户不存在');
  return { user: publicUser(user), authType: 'jwt' };
}

function userFromApiToken(raw) {
  const row = get(
    `SELECT t.id AS token_id, u.id, u.username, u.display_name, u.created_at, u.last_login_at
     FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ?`,
    sha256(raw),
  );
  if (!row) throw new HttpError(401, 'API Token 无效');
  run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', now(), row.token_id);
  return {
    user: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    },
    authType: 'api_token',
    tokenId: row.token_id,
  };
}

export function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const apiHeader = req.headers['x-api-token'];
  if (apiHeader) return String(apiHeader).trim();
  return null;
}

export function authenticateRawToken(token) {
  if (!token) throw new HttpError(401, '未提供认证信息');
  if (token.startsWith('iv_')) return userFromApiToken(token);
  return userFromJwt(token);
}

export function authenticateRequest(req) {
  return authenticateRawToken(extractToken(req));
}

export function requireAuth(req, res, next) {
  try {
    const auth = authenticateRequest(req);
    req.user = auth.user;
    req.authType = auth.authType;
    req.tokenId = auth.tokenId;
    next();
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message || '认证失败' });
  }
}

export function createApiToken(user, name) {
  const token = randomToken('iv_');
  const ts = now();
  const result = run(
    'INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, created_at) VALUES (?, ?, ?, ?, ?)',
    user.id,
    String(name || 'MCP Token').trim().slice(0, 50) || 'MCP Token',
    sha256(token),
    token.slice(0, 10),
    ts,
  );
  return {
    id: result.lastInsertRowid,
    token,
    name: String(name || 'MCP Token').trim().slice(0, 50) || 'MCP Token',
    prefix: token.slice(0, 10),
    created_at: ts,
  };
}

export function listApiTokens(userId) {
  return all(
    'SELECT id, name, token_prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY id DESC',
    userId,
  );
}

export function deleteApiToken(user, id) {
  const row = get('SELECT * FROM api_tokens WHERE id = ? AND user_id = ?', id, user.id);
  if (!row) throw new HttpError(404, 'Token 不存在');
  run('DELETE FROM api_tokens WHERE id = ?', id);
}

export function auditContext(req, source = 'web') {
  return { user: req.user, ip: req.ip, source };
}

export { writeAudit };