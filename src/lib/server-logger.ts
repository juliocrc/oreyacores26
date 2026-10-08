import fs from 'fs';
import path from 'path';
import { getLocalDateKey } from './date-utils';

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateLog(filename: string) {
  const filepath = path.join(LOG_DIR, filename);
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > MAX_LOG_SIZE) {
        const rotated = filepath + '.' + getLocalDateKey();
    fs.renameSync(filepath, rotated);
  }
}

function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function logError(context: string, error: unknown, meta?: Record<string, unknown>) {
  ensureLogDir();
  const filename = 'error.log';
  rotateLog(filename);

  const message = error instanceof Error ? error.stack || error.message : String(error);
  const metaStr = meta ? ' | meta=' + JSON.stringify(meta) : '';
  const line = `[${formatTimestamp()}] [${context}] ${message}${metaStr}\n`;

  fs.appendFileSync(path.join(LOG_DIR, filename), line, 'utf8');
  console.error(`[${context}]`, error);
}

export function logApi(method: string, routePath: string, status: number, durationMs: number, userId?: number) {
  ensureLogDir();
  const filename = 'api.log';
  rotateLog(filename);

  const user = userId ? ` user=${userId}` : '';
  const line = `[${formatTimestamp()}] ${method} ${routePath} → ${status} (${durationMs}ms)${user}\n`;

  fs.appendFileSync(path.join(LOG_DIR, filename), line, 'utf8');
}

export function logAudit(action: string, details: string, userId?: number) {
  ensureLogDir();
  const filename = 'audit.log';
  const user = userId ? ` user=${userId}` : '';
  const line = `[${formatTimestamp()}] ${action}${user}: ${details}\n`;
  fs.appendFileSync(path.join(LOG_DIR, filename), line, 'utf8');
}
