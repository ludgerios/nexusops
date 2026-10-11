import { existsSync, readFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (!process.argv.includes('--confirm')) {
  console.error('Pare a aplicação e execute npm run demo:reset -- --confirm. O banco atual será preservado em um backup.');
  process.exit(1);
}
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
if (/NODE_ENV\s*=\s*production|DEMO_MODE\s*=\s*false/.test(env)) {
  console.error('Restauração bloqueada fora do ambiente demonstrativo.');
  process.exit(1);
}
const configured = /^DATABASE_PATH\s*=\s*(.+)$/m.exec(env)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? './data/nexusops.db';
const db = resolve(root, configured);
if (!db.startsWith(resolve(root, 'data') + (process.platform === 'win32' ? '\\' : '/'))) {
  console.error('Restauração automática permitida apenas dentro da pasta data do projeto.');
  process.exit(1);
}
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(db + suffix)) renameSync(db + suffix, db + '.backup-' + timestamp + suffix);
}
if (existsSync('.demo-credentials')) renameSync('.demo-credentials', '.demo-credentials.backup-' + timestamp);
const result = spawnSync(process.execPath, ['scripts/setup.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
