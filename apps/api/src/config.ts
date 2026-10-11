import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(projectRoot, '.env'), quiet: true });
function integer(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`Configuração ${name} inválida.`);
  return value;
}
export const configuration = {
  databasePath: resolve(projectRoot, process.env.DATABASE_PATH ?? 'data/nexusops.db'),
  host: process.env.HOST ?? '127.0.0.1',
  port: integer('PORT', 3001, 1, 65535),
  production: process.env.NODE_ENV === 'production',
  demoMode: process.env.DEMO_MODE === 'true',
  origins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  intervalMs: integer('SLA_INTERVAL_MS', 30000, 1000, 3600000),
  sessionHours: integer('SESSION_TTL_HOURS', 12, 1, 168),
};
