#!/usr/bin/env node
/**
 * 为项目级 pi Agent MCP（.pi/mcp.json）准备 API Token。
 *
 * - Token 写入 .pi/token（已加入 .gitignore）
 * - 已存在且有效时直接复用，不会重复创建
 * - 以本地 admin 身份创建，并写入操作记录
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';
import { closeDb, get } from '../server/db.js';
import { createApiToken, getUserByUsername } from '../server/auth.js';
import { sha256 } from '../server/crypto.js';
import { writeAudit } from '../server/audit.js';

const tokenFile = path.join(config.rootDir, '.pi', 'token');

function readToken() {
  try {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function tokenExists(token) {
  if (!token) return false;
  return Boolean(get('SELECT id FROM api_tokens WHERE token_hash = ?', sha256(token)));
}

try {
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  let token = readToken();

  if (tokenExists(token)) {
    console.log(`[pi-mcp] 复用现有项目 Token：${token.slice(0, 10)}••••••`);
  } else {
    const admin =
      getUserByUsername('admin') || get('SELECT * FROM users ORDER BY id LIMIT 1');
    if (!admin) throw new Error('数据库中还没有用户，请先启动一次 InfraVerse 完成初始化');

    const created = createApiToken(admin, 'pi-agent (project)');
    token = created.token;
    fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
    writeAudit(
      { user: { id: admin.id, username: admin.username }, source: 'system', ip: 'local' },
      {
        action: 'token.create',
        entityType: 'api_token',
        entityId: created.id,
        summary: '创建项目级 pi Agent Token',
        detail: { name: created.name, file: '.pi/token' },
      },
    );
    console.log(`[pi-mcp] 已创建项目 Token：${token.slice(0, 10)}••••••`);
  }

  console.log(`[pi-mcp] Token 文件：${tokenFile}`);
  console.log('[pi-mcp] 在 pi 中执行 /reload，或重新启动 pi；用 /mcp 或 pi mcp list 检查连接。');
} catch (error) {
  console.error(`[pi-mcp] 初始化失败：${error.message}`);
  process.exitCode = 1;
} finally {
  closeDb();
}