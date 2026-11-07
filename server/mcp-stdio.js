#!/usr/bin/env node
/**
 * stdio MCP Server（本机运行）
 *
 * 用法：
 *   INFRAVERSE_TOKEN=iv_xxx npm run mcp
 *   npm run mcp:setup && npm run mcp        # 项目级：自动读取 .pi/token
 *
 * Token 解析顺序：INFRAVERSE_TOKEN → INFRAVERSE_API_TOKEN → INFRAVERSE_TOKEN_FILE → .pi/token
 * 注意：stdout 专用于 MCP 协议，日志只能输出到 stderr。
 */
import fs from 'node:fs';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { authenticateRawToken } from './auth.js';
import { createMcpServer } from './mcp.js';

function readProjectToken() {
  const explicit = process.env.INFRAVERSE_TOKEN_FILE;
  const file = explicit
    ? path.resolve(config.rootDir, explicit)
    : path.join(config.rootDir, '.pi', 'token');
  try {
    return { token: fs.readFileSync(file, 'utf8').trim(), file };
  } catch {
    return { token: '', file };
  }
}

let token = process.env.INFRAVERSE_TOKEN || process.env.INFRAVERSE_API_TOKEN || '';
let tokenSource = '环境变量';
if (!token) {
  const project = readProjectToken();
  token = project.token;
  tokenSource = project.file;
}

if (!token) {
  console.error('[infraverse-mcp] 未找到 API Token。');
  console.error('[infraverse-mcp] 请运行 npm run mcp:setup 生成项目级 Token，或设置 INFRAVERSE_TOKEN（Web 端「系统设置 → API Token」）。');
  process.exit(1);
}

let auth;
try {
  auth = authenticateRawToken(token);
} catch (error) {
  console.error(`[infraverse-mcp] 认证失败：${error.message}`);
  console.error(`[infraverse-mcp] Token 来源：${tokenSource}。如已重置数据库，请重新运行 npm run mcp:setup。`);
  process.exit(1);
}

const server = createMcpServer({ user: auth.user, source: 'mcp', ip: 'stdio' });
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[infraverse-mcp] 已连接，操作人：${auth.user.username}（stdio，Token 来源：${tokenSource}）`);