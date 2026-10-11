import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Store } from '../apps/api/dist/db.js';
import { hashPassword, randomToken } from '../apps/api/dist/security.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = resolve(root, 'data');
mkdirSync(dataRoot, { recursive: true });
const databasePath = resolve(dataRoot, `restart-verification-${randomUUID()}.db`);
assert(databasePath.startsWith(dataRoot + sep));
const password = randomToken();
const store = new Store(databasePath);
store.run(
  'INSERT INTO users VALUES (?,?,?,?,?,?,?,?)',
  randomUUID(),
  'Validação local',
  'restart@nexusops.local',
  await hashPassword(password),
  'administrator',
  1,
  null,
  new Date().toISOString(),
);
store.close();
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
let server;
let cookie = '';
let csrf = '';
let diagnostics = '';

async function start() {
  server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      DATABASE_PATH: databasePath,
      HOST: '127.0.0.1',
      PORT: String(port),
      WEB_ORIGIN: base,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4000);
  });
  server.stderr.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4000);
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`API encerrou durante a validação: ${diagnostics}`);
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      /* Await readiness while the process starts. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API não iniciou: ${diagnostics}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await stopped;
}
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(response.ok, `HTTP ${response.status} em ${method} ${path}`);
  return { response, body: await response.json() };
}
try {
  await start();
  const login = await request('/api/auth/login', 'POST', {
    email: 'restart@nexusops.local',
    password,
  });
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  csrf = login.body.csrfToken;
  const created = (
    await request('/api/tickets', 'POST', {
      kind: 'incident',
      title: 'Validação de persistência após reinício',
      description:
        'Registro descartável para validar banco, comentários, histórico e sessão após reiniciar o processo da API.',
      category: 'Infraestrutura',
      impact: 'low',
      urgency: 'low',
    })
  ).body;
  await request(`/api/tickets/${created.id}/comments`, 'POST', {
    body: 'Comentário preservado após reinício.',
    internal: false,
  });
  const before = (await request(`/api/tickets/${created.id}`)).body;
  await stop();
  await start();
  assert.equal((await request('/api/auth/me')).body.user.email, 'restart@nexusops.local');
  const after = (await request(`/api/tickets/${created.id}`)).body;
  assert.equal(after.ticket.number, created.number);
  assert.equal(after.ticket.version, before.ticket.version);
  assert.deepEqual(after.comments, before.comments);
  assert.deepEqual(after.history, before.history);
  assert.equal((await request('/api/tickets?kind=incident')).body.total, 1);
  console.log(
    'Aprovado: chamado, comentários, histórico e sessão persistem após reiniciar o processo da API.',
  );
} finally {
  await stop();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = databasePath + suffix;
    assert(file.startsWith(dataRoot + sep));
    if (existsSync(file)) unlinkSync(file);
  }
}
