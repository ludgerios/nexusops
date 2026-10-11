import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Instale Node.js 24 LTS antes de preparar o NexusOps.');
  process.exit(1);
}
if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('.env criado para o ambiente local.');
} else {
  console.log('.env existente preservado.');
}
mkdirSync('data', { recursive: true });
function run(script) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('db:migrate');
run('seed');
console.log('\nNexusOps preparado. Execute npm run dev.');
console.log('Aplicação: http://localhost:5173 • API: http://localhost:3001/health');
console.log('Consulte as contas locais no arquivo .demo-credentials (fora do Git).');
