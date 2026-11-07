import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// Optional .env loading (Node >= 20.12). Missing file is fine.
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // ignore
}

const dataDir = path.resolve(rootDir, process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

function loadOrCreateSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) {
    return process.env.JWT_SECRET;
  }
  const keyFile = path.join(dataDir, 'secret.key');
  try {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // create below
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(keyFile, secret, { mode: 0o600 });
  return secret;
}

export const config = {
  rootDir,
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  dbPath: path.join(dataDir, 'infraverse.db'),
  distDir: path.join(rootDir, 'dist'),
  jwtSecret: loadOrCreateSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  simulateCommands: process.env.SIMULATE_COMMANDS !== 'false',
  allowRegister: process.env.ALLOW_REGISTER !== 'false',
  version: '1.0.0',
};

export const now = () => new Date().toISOString();