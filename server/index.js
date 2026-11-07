import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config, now } from './config.js';
import { closeDb, dbStats, get } from './db.js';
import { HttpError } from './errors.js';
import {
  auditContext,
  authenticateRawToken,
  authenticateRequest,
  changePassword,
  checkPassword,
  createApiToken,
  deleteApiToken,
  extractToken,
  getUserById,
  getUserByUsername,
  listApiTokens,
  markLogin,
  publicUser,
  registerUser,
  requireAuth,
  signUserToken,
  writeAudit,
} from './auth.js';
import { auditActions, listAudit } from './audit.js';
import { COMMANDS, HEALTH_META, MATERIAL_STATUSES, materialTypeCatalog } from './types.js';
import {
  createMaterial,
  deleteMaterial,
  getMaterial,
  listMaterials,
  materialStats,
  updateMaterial,
} from './materials.js';
import { ROOM, createRack, deleteRack, getRack, listRacks, updateRack } from './racks.js';
import {
  ackCommand,
  dashboard,
  getServerStatus,
  listCommands,
  sendCommand,
  twinData,
  updateTelemetry,
} from './status.js';
import { createMcpServer } from './mcp.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
});

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------------- 基础信息 ------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'InfraVerse',
    version: config.version,
    time: now(),
    simulate_commands: config.simulateCommands,
    auth_required: true,
  });
});

app.get('/api/meta', requireAuth, (req, res) => {
  res.json({
    version: config.version,
    allow_register: config.allowRegister,
    simulate_commands: config.simulateCommands,
    material_types: materialTypeCatalog(),
    statuses: MATERIAL_STATUSES,
    commands: COMMANDS,
    health: HEALTH_META,
    room: ROOM,
    stats: materialStats(),
    db: dbStats(),
  });
});

/* --------------------------------- 认证 --------------------------------- */

const loginAttempts = new Map();
function loginKey(req, username) {
  return `${req.ip}|${String(username).toLowerCase()}`;
}
function ensureLoginAllowed(req, username) {
  const key = loginKey(req, username);
  const entry = loginAttempts.get(key);
  if (!entry) return;
  if (entry.resetAt < Date.now()) {
    loginAttempts.delete(key);
    return;
  }
  if (entry.count >= 12) {
    throw new HttpError(429, '登录失败次数过多，请 10 分钟后再试');
  }
}
function recordLoginFailure(req, username) {
  const key = loginKey(req, username);
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < Date.now()) {
    loginAttempts.set(key, { count: 1, resetAt: Date.now() + 10 * 60_000 });
  } else {
    entry.count++;
  }
}

app.post('/api/auth/register', (req, res) => {
  const { username, password, display_name } = req.body || {};
  const user = registerUser({ username, password, displayName: display_name });
  markLogin(user.id);
  const fresh = getUserById(user.id);
  const ctx = { user: publicUser(fresh), ip: req.ip, source: 'web' };
  writeAudit(ctx, {
    action: 'auth.register',
    entityType: 'user',
    entityId: fresh.id,
    summary: `新用户注册：${fresh.username}`,
    detail: { username: fresh.username, display_name: fresh.display_name },
  });
  res.status(201).json({ token: signUserToken(fresh), user: publicUser(fresh) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  ensureLoginAllowed(req, name);
  const user = getUserByUsername(name);
  if (!user || !checkPassword(user, String(password || ''))) {
    recordLoginFailure(req, name);
    writeAudit(
      { user: null, username: name || 'unknown', ip: req.ip, source: 'web' },
      {
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: null,
        summary: `登录失败：${name || '空用户名'}`,
        detail: null,
      },
    );
    throw new HttpError(401, '用户名或密码错误');
  }
  loginAttempts.delete(loginKey(req, name));
  markLogin(user.id);
  const fresh = getUserById(user.id);
  const ctx = { user: publicUser(fresh), ip: req.ip, source: 'web' };
  writeAudit(ctx, {
    action: 'auth.login',
    entityType: 'user',
    entityId: fresh.id,
    summary: `用户登录：${fresh.username}`,
    detail: null,
  });
  res.json({ token: signUserToken(fresh), user: publicUser(fresh) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user, auth_type: req.authType });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body || {};
  changePassword(req.user, String(old_password || ''), String(new_password || ''));
  writeAudit(auditContext(req), {
    action: 'auth.change_password',
    entityType: 'user',
    entityId: req.user.id,
    summary: `修改密码：${req.user.username}`,
  });
  res.json({ ok: true });
});

/* -------------------------------- API Token ------------------------------ */

app.get('/api/tokens', requireAuth, (req, res) => {
  res.json({ items: listApiTokens(req.user.id) });
});

app.post('/api/tokens', requireAuth, (req, res) => {
  const { name } = req.body || {};
  const token = createApiToken(req.user, name);
  writeAudit(auditContext(req), {
    action: 'token.create',
    entityType: 'api_token',
    entityId: token.id,
    summary: `创建 API Token：${token.name}`,
    detail: { prefix: token.prefix },
  });
  res.status(201).json(token);
});

app.delete('/api/tokens/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = get('SELECT name, token_prefix FROM api_tokens WHERE id = ? AND user_id = ?', id, req.user.id);
  deleteApiToken(req.user, id);
  writeAudit(auditContext(req), {
    action: 'token.delete',
    entityType: 'api_token',
    entityId: id,
    summary: `删除 API Token：${row?.name || id}`,
    detail: row ? { prefix: row.token_prefix } : null,
  });
  res.json({ ok: true });
});

/* --------------------------------- 物料 ---------------------------------- */

app.get('/api/materials', requireAuth, (req, res) => {
  res.json(
    listMaterials({
      q: req.query.q,
      type: req.query.type,
      status: req.query.status,
      rack_id: req.query.rack_id,
      rack: req.query.rack,
      parent_id: req.query.parent_id,
      root_only: req.query.root_only,
      unplaced: req.query.unplaced,
      page: req.query.page,
      page_size: req.query.page_size,
      sort: req.query.sort,
      order: req.query.order,
    }),
  );
});

app.post('/api/materials', requireAuth, (req, res) => {
  res.status(201).json(createMaterial(req.body || {}, auditContext(req)));
});

app.get('/api/materials/:ref', requireAuth, (req, res) => {
  const material = getMaterial(req.params.ref, {
    reveal: req.query.reveal !== '0',
    includeChildren: req.query.children !== '0',
  });
  if (!material) throw new HttpError(404, '物料不存在');
  res.json(material);
});

app.patch('/api/materials/:ref', requireAuth, (req, res) => {
  res.json(updateMaterial(req.params.ref, req.body || {}, auditContext(req)));
});

app.delete('/api/materials/:ref', requireAuth, (req, res) => {
  const cascade = req.query.cascade === '1' || req.query.cascade === 'true' || req.body?.cascade === true;
  res.json(deleteMaterial(req.params.ref, { cascade }, auditContext(req)));
});

app.get('/api/materials/:ref/commands', requireAuth, (req, res) => {
  res.json(listCommands({ material: req.params.ref, limit: req.query.limit }));
});

app.post('/api/materials/:ref/commands', requireAuth, (req, res) => {
  const { action, params } = req.body || {};
  res.status(201).json(sendCommand(req.params.ref, action, params || {}, auditContext(req)));
});

/* --------------------------------- 机柜 ---------------------------------- */

app.get('/api/racks', requireAuth, (req, res) => {
  res.json({ items: listRacks() });
});

app.post('/api/racks', requireAuth, (req, res) => {
  res.status(201).json(createRack(req.body || {}, auditContext(req)));
});

app.get('/api/racks/:rack/elevation', requireAuth, (req, res) => {
  const rack = getRack(req.params.rack);
  if (!rack) throw new HttpError(404, '机柜不存在');
  const items = listMaterials({
    rack: rack.name,
    sort: 'position_u',
    order: 'asc',
    page_size: 500,
  }).items.filter((m) => m.position_u !== null);
  res.json({ rack, items });
});

app.patch('/api/racks/:rack', requireAuth, (req, res) => {
  res.json(updateRack(req.params.rack, req.body || {}, auditContext(req)));
});

app.delete('/api/racks/:rack', requireAuth, (req, res) => {
  const force = req.query.force === '1' || req.query.force === 'true';
  res.json(deleteRack(req.params.rack, { force }, auditContext(req)));
});

/* ------------------------------ 孪生 / 状态 ------------------------------- */

app.get('/api/twin', requireAuth, (req, res) => {
  res.json(twinData());
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  res.json(dashboard());
});

app.get('/api/status/:ref', requireAuth, (req, res) => {
  const status = getServerStatus(req.params.ref);
  if (!status) throw new HttpError(404, '服务器状态不存在');
  res.json(status);
});

app.post('/api/telemetry', requireAuth, (req, res) => {
  const payload = req.body || {};
  const ref = payload.material ?? payload.material_id ?? payload.id ?? payload.code;
  res.json(updateTelemetry({ ...payload, material_id: ref }, auditContext(req, req.authType === 'api_token' ? 'agent' : 'web')));
});

app.get('/api/commands', requireAuth, (req, res) => {
  res.json(listCommands({ material: req.query.material, status: req.query.status, limit: req.query.limit }));
});

app.post('/api/commands/:id/ack', requireAuth, (req, res) => {
  const { status, result } = req.body || {};
  res.json(ackCommand(Number(req.params.id), { status, result }, auditContext(req)));
});

/* -------------------------------- 操作记录 ------------------------------- */

app.get('/api/logs', requireAuth, (req, res) => {
  res.json(
    listAudit({
      q: req.query.q,
      action: req.query.action,
      entityType: req.query.entity_type,
      username: req.query.username,
      source: req.query.source,
      limit: req.query.limit,
      offset: req.query.offset,
    }),
  );
});

app.get('/api/logs/actions', requireAuth, (req, res) => {
  res.json({ items: auditActions() });
});

/* ---------------------------------- MCP ---------------------------------- */

app.all('/mcp', asyncRoute(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST for Streamable HTTP.' },
      id: null,
    });
    return;
  }
  let auth;
  try {
    auth = authenticateRawToken(extractToken(req));
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message || 'Unauthorized' });
    return;
  }
  const server = createMcpServer({ user: auth.user, source: 'mcp', ip: req.ip });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}));

/* --------------------------------- 静态资源 ------------------------------- */

const indexFile = path.join(config.distDir, 'index.html');
if (fs.existsSync(indexFile)) {
  app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/mcp')) return next();
    res.sendFile('index.html', { root: config.distDir, dotfiles: 'allow' });
  });
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});
app.use((req, res) => {
  if (req.path === '/' && !fs.existsSync(indexFile)) {
    res.type('text/plain').send(
      'InfraVerse API 已启动。开发模式请访问 Vite 地址（http://localhost:5173），生产模式请先执行 npm run build。',
    );
    return;
  }
  res.status(404).send('Not Found');
});

/* --------------------------------- 错误处理 ------------------------------- */

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error('[server]', error);
  const payload = {
    error: error.message || '服务器内部错误',
  };
  if (error.details) payload.details = error.details;
  res.status(status).json(payload);
});

const httpServer = app.listen(config.port, config.host, () => {
  console.log(`\n  InfraVerse ${config.version}`);
  console.log(`  API      http://localhost:${config.port}/api`);
  console.log(`  MCP      http://localhost:${config.port}/mcp  (Bearer API Token)`);
  console.log(`  Web      ${fs.existsSync(indexFile) ? `http://localhost:${config.port}` : 'http://localhost:5173 (dev)'}`);
  console.log(`  SQLite   ${config.dbPath}`);
  console.log(`  演示指令 ${config.simulateCommands ? '已开启（SIMULATE_COMMANDS=true）' : '已关闭'}\n`);
  if (!get('SELECT id FROM users LIMIT 1')) {
    console.log('  首次启动账号：admin / admin123\n');
  }
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down...`);
  httpServer.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app };