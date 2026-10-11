import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { User, Ticket } from '@nexusops/shared';
import { buildApp } from '../src/app.js';
import { seedDemo } from '../src/seed.js';
import { Store } from '../src/db.js';
import { TicketService, slaState, publicUser } from '../src/domain.js';
import { tokenHash } from '../src/security.js';

const PASSWORD = 'Local-test!Strong-Pass24';
const baseline = new Date('2026-10-11T12:00:00.000Z');
let time = new Date(baseline);
let context: Awaited<ReturnType<typeof buildApp>>;
let temporary: string;
let admin: User, agent: User, requester: User, other: User;
type Credentials = { cookie: string; csrf: string; user: User };
let adminAuth: Credentials, agentAuth: Credentials, requesterAuth: Credentials;
async function login(email: string) {
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return {
    cookie: String(response.headers['set-cookie']).split(';')[0],
    csrf: response.json().csrfToken,
    user: response.json().user,
  } as Credentials;
}
async function request(
  auth: Credentials,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
) {
  return context.app.inject({
    method,
    url,
    headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
    ...(payload === undefined ? {} : { payload }),
  });
}
const ticketInput = (overrides: Record<string, unknown> = {}) => ({
  kind: 'incident',
  title: 'Falha de teste em aplicação',
  description: 'Aplicação demonstrativa apresenta falha ao carregar dados.',
  category: 'Aplicações',
  impact: 'medium',
  urgency: 'medium',
  ...overrides,
});
beforeAll(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'nexusops-test-'));
  context = await buildApp({ worker: false, clock: () => time });
  await seedDemo(context.store, { root: temporary, password: PASSWORD, now: baseline });
  const users = context.store.all<Omit<User, 'active'> & { active: number }>('SELECT * FROM users');
  admin = publicUser(users.find((u) => u.email === 'admin@nexusops.local')!);
  agent = publicUser(users.find((u) => u.email === 'agente@nexusops.local')!);
  requester = publicUser(users.find((u) => u.email === 'solicitante@nexusops.local')!);
  other = publicUser(users.find((u) => u.email === 'rafael@nexusops.local')!);
  adminAuth = await login(admin.email);
  agentAuth = await login(agent.email);
  requesterAuth = await login(requester.email);
}, 30000);
afterAll(async () => {
  await context?.app.close();
  if (temporary) {
    const target = resolve(temporary);
    expect(dirname(target)).toBe(resolve(tmpdir()));
    expect(basename(target).startsWith('nexusops-test-')).toBe(true);
    rmSync(target, { recursive: true, force: true });
  }
});

describe('Authentication and session security', () => {
  it('health is public and protected API requires a session', async () => {
    expect((await context.app.inject('/health')).json()).toMatchObject({
      status: 'ok',
      database: 'ok',
    });
    expect((await context.app.inject('/api/tickets')).statusCode).toBe(401);
    expect((await context.app.inject('/api/auth/me')).statusCode).toBe(401);
  });
  it('applies authentication to encoded API aliases without leaking data', async () => {
    for (const url of ['/%61pi/tickets', '/%61pi/meta', '/%61pi/dashboard', '/%61pi/auth/me']) {
      const result = await context.app.inject({ url });
      expect(result.statusCode).toBe(401);
      expect(result.json().error.code).toBe('UNAUTHENTICATED');
    }
    const result = await context.app.inject('/api%2ftickets');
    expect(result.statusCode).toBe(404);
    expect(result.body).not.toContain('passwordHash');
  });
  it('stores an opaque hash and returns a secure session identification', async () => {
    const result = await request(adminAuth, 'GET', '/api/auth/me');
    expect(result.json()).toMatchObject({
      user: { id: admin.id, role: 'administrator' },
      csrfToken: adminAuth.csrf,
    });
    const token = adminAuth.cookie.split('=')[1];
    expect(
      context.store.get('SELECT tokenHash FROM sessions WHERE tokenHash=?', token),
    ).toBeUndefined();
    expect(
      context.store.get('SELECT tokenHash FROM sessions WHERE tokenHash=?', tokenHash(token)),
    ).toBeTruthy();
    expect(JSON.stringify(result.json())).not.toContain('passwordHash');
  });
  it('rejects wrong credentials without revealing whether the user exists', async () => {
    for (const email of [admin.email, 'does-not-exist@nexusops.local']) {
      const result = await context.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'incorrect' },
      });
      expect(result.statusCode).toBe(401);
      expect(result.json().error.message).toBe('E-mail ou senha inválidos.');
    }
  });
  it('enforces CSRF and rejects an untrusted login origin', async () => {
    const noCsrf = await context.app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { cookie: adminAuth.cookie },
      payload: ticketInput(),
    });
    expect(noCsrf.statusCode).toBe(403);
    const bad = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://untrusted.example' },
      payload: { email: admin.email, password: PASSWORD },
    });
    expect(bad.statusCode).toBe(403);
    const wrong = await context.app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { cookie: adminAuth.cookie, 'x-csrf-token': 'wrong' },
      payload: ticketInput(),
    });
    expect(wrong.statusCode).toBe(403);
  });
  it('logout invalidates the database session and clears cookie', async () => {
    const auth = await login('beatriz@nexusops.local');
    const result = await request(auth, 'POST', '/api/auth/logout');
    expect(result.statusCode).toBe(200);
    expect(result.headers['set-cookie']).toContain('Max-Age=0');
    expect((await request(auth, 'GET', '/api/auth/me')).statusCode).toBe(401);
  });
  it('locks repeated invalid account attempts, persisting the limiter', async () => {
    for (let n = 0; n < 10; n++) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'blocked@nexusops.local', password: 'incorrect' },
      });
      expect(response.statusCode).toBe(401);
    }
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'blocked@nexusops.local', password: 'incorrect' },
    });
    expect(response.statusCode).toBe(429);
    expect(
      context.store.get<{ count: number }>(
        'SELECT count FROM login_attempts WHERE key=?',
        tokenHash('blocked@nexusops.local'),
      )!.count,
    ).toBe(10);
  }, 15000);
  it('rejects an expired session and disables account access immediately', async () => {
    time = new Date(baseline.getTime() + 13 * 3600000);
    expect((await request(requesterAuth, 'GET', '/api/auth/me')).statusCode).toBe(401);
    time = new Date(baseline);
    const auth = await login('beatriz@nexusops.local');
    const user = auth.user;
    expect(
      (await request(adminAuth, 'PATCH', `/api/admin/users/${user.id}`, { active: false }))
        .statusCode,
    ).toBe(200);
    expect((await request(auth, 'GET', '/api/auth/me')).statusCode).toBe(401);
    expect(
      (
        await context.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: user.email, password: PASSWORD },
        })
      ).statusCode,
    ).toBe(401);
    await request(adminAuth, 'PATCH', `/api/admin/users/${user.id}`, { active: true });
  });
});

describe('Backend authorization', () => {
  it('administrator is enforced for users, teams, matrix and policies', async () => {
    expect((await request(requesterAuth, 'GET', '/api/admin')).statusCode).toBe(403);
    expect(
      (await request(agentAuth, 'POST', '/api/admin/teams', { name: 'Equipe não permitida' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await request(agentAuth, 'PATCH', '/api/slas/1', {
          responseMinutes: 20,
          resolutionMinutes: 240,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(agentAuth, 'PUT', '/api/admin/priority-matrix', {
          matrix: [
            [4, 3, 2],
            [3, 2, 2],
            [2, 2, 1],
          ],
        })
      ).statusCode,
    ).toBe(403);
  });
  it('requester only lists and reads own incidents and requests', async () => {
    const result = await request(requesterAuth, 'GET', '/api/tickets?limit=100');
    expect(
      result
        .json()
        .items.every((t: Ticket) => t.requesterId === requester.id && t.kind !== 'problem'),
    ).toBe(true);
    const privateTicket = context.service.all('t.requesterId=?', [other.id])[0];
    expect(
      (await request(requesterAuth, 'GET', `/api/tickets/${privateTicket.id}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await request(requesterAuth, 'PATCH', `/api/tickets/${privateTicket.id}`, {
          version: privateTicket.version,
          title: 'Tentativa não autorizada',
        })
      ).statusCode,
    ).toBe(404);
  });
  it('requester cannot create problems, set another requester, assign or write internal notes', async () => {
    expect(
      (await request(requesterAuth, 'POST', '/api/tickets', ticketInput({ kind: 'problem' })))
        .statusCode,
    ).toBe(403);
    expect(
      (await request(requesterAuth, 'POST', '/api/tickets', ticketInput({ requesterId: other.id })))
        .statusCode,
    ).toBe(403);
    expect(
      (await request(requesterAuth, 'POST', '/api/tickets', ticketInput({ assigneeId: agent.id })))
        .statusCode,
    ).toBe(403);
    const own = context.service.create(
      requester,
      ticketInput() as Parameters<TicketService['create']>[1],
    );
    expect(
      (
        await request(requesterAuth, 'POST', `/api/tickets/${own.id}/comments`, {
          body: 'Nota interna indevida',
          internal: true,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(requesterAuth, 'PATCH', `/api/tickets/${own.id}`, {
          version: own.version,
          status: 'in_progress',
        })
      ).statusCode,
    ).toBe(403);
  });
  it('hides internal comment bodies, history and problem data from requester', async () => {
    const ticket = context.service.create(
      requester,
      ticketInput() as Parameters<TicketService['create']>[1],
    );
    context.service.comment(agent, ticket.id, 'SEGREDO_INTERNO_FICTICIO', true);
    const problem = context.service.all("t.kind='problem'")[0];
    context.service.relate(agent, problem.id, ticket.id);
    const response = await request(requesterAuth, 'GET', `/api/tickets/${ticket.id}`);
    expect(JSON.stringify(response.json())).not.toContain('SEGREDO_INTERNO_FICTICIO');
    expect(response.json().relatedProblem).toBeNull();
    expect(response.json().comments).toHaveLength(0);
    expect(
      response.json().history.some((h: { event: string }) => h.event === 'relation_changed'),
    ).toBe(false);
    expect((await request(requesterAuth, 'GET', '/api/automations')).statusCode).toBe(403);
  });
});

describe('Incident lifecycle and optimistic updates', () => {
  it('creates, calculates priority, assigns, responds, comments, resolves and closes persistently', async () => {
    time = new Date(baseline);
    let response = await request(
      requesterAuth,
      'POST',
      '/api/tickets',
      ticketInput({ impact: 'high', urgency: 'high' }),
    );
    expect(response.statusCode).toBe(201);
    let ticket: Ticket = response.json();
    expect(ticket.priority).toBe(1);
    expect(ticket.number).toMatch(/^INC\d{7}$/);
    expect(ticket.status).toBe('new');
    expect(ticket.responseDueAt).toBe('2026-10-11T12:15:00.000Z');
    expect(ticket.resolutionDueAt).toBe('2026-10-11T16:00:00.000Z');
    const stale = ticket.version;
    time = new Date(baseline.getTime() + 5 * 60000);
    response = await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
      version: ticket.version,
      status: 'in_progress',
      assigneeId: agent.id,
    });
    expect(response.statusCode).toBe(200);
    ticket = response.json();
    expect(ticket.assigneeId).toBe(agent.id);
    expect(ticket.responseAt).toBe(time.toISOString());
    expect(ticket.responseSlaState).toBe('met');
    expect(ticket).toMatchObject({
      impact: 'high',
      urgency: 'high',
      priority: 1,
      responseDueAt: '2026-10-11T12:15:00.000Z',
      resolutionDueAt: '2026-10-11T16:00:00.000Z',
    });
    expect(
      (
        await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
          version: stale,
          title: 'Edição concorrente inválida',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(agentAuth, 'POST', `/api/tickets/${ticket.id}/comments`, {
          body: 'Correção aplicada e validada.',
          internal: false,
        })
      ).statusCode,
    ).toBe(201);
    ticket = (await request(agentAuth, 'GET', `/api/tickets/${ticket.id}`)).json().ticket;
    expect(ticket).toMatchObject({
      impact: 'high',
      urgency: 'high',
      priority: 1,
      responseDueAt: '2026-10-11T12:15:00.000Z',
      resolutionDueAt: '2026-10-11T16:00:00.000Z',
    });
    response = await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
      version: ticket.version,
      status: 'resolved',
      resolution: 'Configuração revisada e serviço restabelecido.',
    });
    expect(response.statusCode).toBe(200);
    ticket = response.json();
    expect(ticket.resolutionSlaState).toBe('met');
    expect(ticket).toMatchObject({
      impact: 'high',
      urgency: 'high',
      priority: 1,
      responseDueAt: '2026-10-11T12:15:00.000Z',
      resolutionDueAt: '2026-10-11T16:00:00.000Z',
    });
    ticket = (
      await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
        version: ticket.version,
        status: 'closed',
      })
    ).json();
    expect(ticket.status).toBe('closed');
    const detail = (await request(requesterAuth, 'GET', `/api/tickets/${ticket.id}`)).json();
    expect(detail.comments).toHaveLength(1);
    expect(detail.history.some((h: { event: string }) => h.event === 'first_response')).toBe(true);
    expect(
      (
        await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
          version: ticket.version,
          status: 'in_progress',
        })
      ).statusCode,
    ).toBe(400);
    time = new Date(baseline);
  });
  it('rejects invalid transitions, empty resolution and missing/unknown fields', async () => {
    const ticket = context.service.create(
      requester,
      ticketInput() as Parameters<TicketService['create']>[1],
    );
    expect(
      (
        await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
          version: ticket.version,
          status: 'closed',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
          version: ticket.version,
          status: 'resolved',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await request(agentAuth, 'POST', '/api/tickets', ticketInput({ title: 'a' }))).statusCode,
    ).toBe(400);
    expect(
      (await request(agentAuth, 'POST', '/api/tickets', ticketInput({ priority: 1 }))).statusCode,
    ).toBe(400);
    expect(
      (await request(agentAuth, 'POST', '/api/tickets', ticketInput({ assigneeId: requester.id })))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
          version: ticket.version + 1,
          kind: 'problem',
        })
      ).statusCode,
    ).toBe(400);
  });
  it('applies filters, escaped search and database pagination', async () => {
    const response = await request(
      agentAuth,
      'GET',
      '/api/tickets?kind=incident&priority=1&page=1&limit=2',
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(2);
    expect(response.json().total).toBeGreaterThan(2);
    expect(
      response.json().items.every((t: Ticket) => t.kind === 'incident' && t.priority === 1),
    ).toBe(true);
    const next = await request(
      agentAuth,
      'GET',
      '/api/tickets?kind=incident&priority=1&page=2&limit=2',
    );
    expect(next.json().items[0].id).not.toBe(response.json().items[0].id);
    expect((await request(agentAuth, 'GET', '/api/tickets?search=%25')).json().total).toBe(0);
  });
  it('generates unique numbers under multiple submissions', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => request(agentAuth, 'POST', '/api/tickets', ticketInput())),
    );
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    expect(new Set(results.map((r) => r.json().number)).size).toBe(6);
  });
  it('rolls back tickets, numbers and events if a transactional automation fails', () => {
    const before = context.store.get<{ value: number }>(
      'SELECT value FROM counters WHERE kind=?',
      'incident',
    )!.value;
    const count = context.store.get<{ n: number }>('SELECT COUNT(*) n FROM tickets')!.n;
    const spy = vi.spyOn(context.service, 'notify').mockImplementationOnce(() => {
      throw new Error('Simulated database action failure');
    });
    expect(() =>
      context.service.create(
        requester,
        ticketInput({ impact: 'high', urgency: 'high' }) as Parameters<TicketService['create']>[1],
      ),
    ).toThrow();
    spy.mockRestore();
    expect(
      context.store.get<{ value: number }>('SELECT value FROM counters WHERE kind=?', 'incident')!
        .value,
    ).toBe(before);
    expect(context.store.get<{ n: number }>('SELECT COUNT(*) n FROM tickets')!.n).toBe(count);
  });
});

describe('Problem and service request domains', () => {
  it('creates and investigates problem, links incident, requires root cause and resolves', async () => {
    let problem: Ticket = (
      await request(
        agentAuth,
        'POST',
        '/api/tickets',
        ticketInput({ kind: 'problem', title: 'Problema de autenticação recorrente' }),
      )
    ).json();
    const incident: Ticket = (
      await request(requesterAuth, 'POST', '/api/tickets', ticketInput())
    ).json();
    expect(problem.number).toMatch(/^PRB\d{7}$/);
    expect(
      (
        await request(agentAuth, 'POST', `/api/tickets/${problem.id}/relations`, {
          incidentId: incident.id,
        })
      ).statusCode,
    ).toBe(200);
    let detail = (await request(agentAuth, 'GET', `/api/tickets/${problem.id}`)).json();
    expect(detail.relatedIncidents[0].id).toBe(incident.id);
    problem = detail.ticket;
    expect(
      (await request(agentAuth, 'GET', `/api/tickets/${incident.id}`)).json().relatedProblem.id,
    ).toBe(problem.id);
    problem = (
      await request(agentAuth, 'PATCH', `/api/tickets/${problem.id}`, {
        version: problem.version,
        status: 'in_progress',
        workaround: 'Usar conexão secundária.',
      })
    ).json();
    expect(
      (
        await request(agentAuth, 'PATCH', `/api/tickets/${problem.id}`, {
          version: problem.version,
          status: 'resolved',
          resolution: 'Falha corrigida.',
        })
      ).statusCode,
    ).toBe(400);
    problem = (
      await request(agentAuth, 'PATCH', `/api/tickets/${problem.id}`, {
        version: problem.version,
        status: 'resolved',
        resolution: 'Falha corrigida.',
        rootCause: 'Token expirado na configuração.',
      })
    ).json();
    expect(problem.status).toBe('resolved');
    expect(
      (await request(agentAuth, 'DELETE', `/api/tickets/${problem.id}/relations/${incident.id}`))
        .statusCode,
    ).toBe(200);
    detail = (await request(agentAuth, 'GET', `/api/tickets/${problem.id}`)).json();
    expect(detail.relatedIncidents).toHaveLength(0);
  });
  it('enforces one related problem per incident and valid relation kinds', async () => {
    const a = context.service.create(
        agent,
        ticketInput({ kind: 'problem' }) as Parameters<TicketService['create']>[1],
      ),
      b = context.service.create(
        agent,
        ticketInput({ kind: 'problem' }) as Parameters<TicketService['create']>[1],
      );
    const incident = context.service.create(
      requester,
      ticketInput() as Parameters<TicketService['create']>[1],
    );
    context.service.relate(agent, a.id, incident.id);
    expect(
      (
        await request(agentAuth, 'POST', `/api/tickets/${b.id}/relations`, {
          incidentId: incident.id,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await request(agentAuth, 'POST', `/api/tickets/${a.id}/relations`, { incidentId: b.id }))
        .statusCode,
    ).toBe(400);
    expect(() =>
      context.store.run(
        'INSERT INTO problem_incidents VALUES (?,?,?)',
        a.id,
        b.id,
        time.toISOString(),
      ),
    ).toThrow();
  });
  it('requires a request type and completes the distinct service request lifecycle', async () => {
    expect(
      (await request(requesterAuth, 'POST', '/api/tickets', ticketInput({ kind: 'request' })))
        .statusCode,
    ).toBe(400);
    let ticket: Ticket = (
      await request(
        requesterAuth,
        'POST',
        '/api/tickets',
        ticketInput({ kind: 'request', requestType: 'Instalação de software' }),
      )
    ).json();
    expect(ticket.number).toMatch(/^REQ\d{7}$/);
    ticket = (
      await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
        version: ticket.version,
        status: 'in_progress',
        assigneeId: agent.id,
      })
    ).json();
    ticket = (
      await request(agentAuth, 'PATCH', `/api/tickets/${ticket.id}`, {
        version: ticket.version,
        status: 'resolved',
        resolution: 'Software instalado e validado.',
      })
    ).json();
    expect(ticket.resolvedAt).toBeTruthy();
    expect(
      (
        await request(
          agentAuth,
          'POST',
          '/api/tickets',
          ticketInput({ requestType: 'Não permitido' }),
        )
      ).statusCode,
    ).toBe(400);
  });
});

describe('SLA deadlines, persistent automations and analytics', () => {
  it('handles all SLA state boundaries in UTC including completed late', () => {
    const start = '2026-10-11T12:00:00Z',
      due = '2026-10-11T13:00:00Z';
    expect(slaState(due, null, new Date('2026-10-11T12:10:00Z'), start)).toBe('on_track');
    expect(slaState(due, null, new Date('2026-10-11T12:48:00Z'), start)).toBe('at_risk');
    expect(slaState(due, null, new Date(due), start)).toBe('breached');
    expect(slaState(due, due, new Date(due), start)).toBe('met');
    expect(slaState(due, '2026-10-11T13:00:01Z', new Date(due), start)).toBe('missed');
  });
  it('persists near and breach notifications once and captures first response', async () => {
    time = new Date(baseline);
    const ticket = context.service.create(
      requester,
      ticketInput({ impact: 'high', urgency: 'high' }) as Parameters<TicketService['create']>[1],
    );
    time = new Date(baseline.getTime() + 12 * 60000);
    context.service.tick();
    context.service.tick();
    expect(context.service.get(ticket.id).responseSlaState).toBe('at_risk');
    expect(
      context.store.get<{ n: number }>(
        'SELECT COUNT(*) n FROM automation_executions WHERE ticketId=? AND ruleId=?',
        ticket.id,
        'sla-near',
      )!.n,
    ).toBe(1);
    time = new Date(baseline.getTime() + 16 * 60000);
    context.service.tick();
    context.service.tick();
    expect(context.service.get(ticket.id).responseSlaState).toBe('breached');
    expect(
      context.store.get<{ n: number }>(
        'SELECT COUNT(*) n FROM automation_executions WHERE ticketId=? AND ruleId=?',
        ticket.id,
        'sla-breach',
      )!.n,
    ).toBe(1);
    context.service.comment(agent, ticket.id, 'Equipe iniciou atendimento.', false);
    expect(context.service.get(ticket.id).responseSlaState).toBe('missed');
    let updated = context.service.update(agent, ticket.id, {
      version: context.service.get(ticket.id).version,
      status: 'in_progress',
    });
    time = new Date(baseline.getTime() + 5 * 3600000);
    context.service.tick();
    context.service.tick();
    expect(context.service.get(ticket.id).resolutionSlaState).toBe('breached');
    updated = context.service.update(agent, ticket.id, {
      version: updated.version,
      status: 'resolved',
      resolution: 'Serviço recuperado após análise.',
    });
    expect(updated.resolutionSlaState).toBe('missed');
    expect(
      context.store.get<{ n: number }>(
        'SELECT COUNT(*) n FROM automation_executions WHERE ticketId=? AND ruleId=?',
        ticket.id,
        'sla-breach',
      )!.n,
    ).toBe(2);
    time = new Date(baseline);
  });
  it('records failed background execution and retries successfully without duplicate notifications', () => {
    const ticket = context.service.create(
      requester,
      ticketInput({ impact: 'low', urgency: 'low' }) as Parameters<TicketService['create']>[1],
    );
    const notify = context.service.notify.bind(context.service);
    let fail = true;
    const spy = vi
      .spyOn(context.service, 'notify')
      .mockImplementation((userIds, key, title, body, id) => {
        if (id === ticket.id && fail) {
          fail = false;
          throw new Error('Transient action failure');
        }
        return notify(userIds, key, title, body, id);
      });
    time = new Date(baseline.getTime() + 4 * 3600000);
    context.service.tick();
    context.service.tick();
    context.service.tick();
    spy.mockRestore();
    const executions = context.store.all<{ status: string }>(
      'SELECT status FROM automation_executions WHERE ticketId=? AND ruleId=?',
      ticket.id,
      'sla-breach',
    );
    expect(executions.filter((e) => e.status === 'failed')).toHaveLength(1);
    expect(executions.filter((e) => e.status === 'success')).toHaveLength(1);
    expect(
      context.store.get<{ n: number }>(
        'SELECT COUNT(*) n FROM notifications WHERE ticketId=?',
        ticket.id,
      )!.n,
    ).toBe(3);
    time = new Date(baseline);
  });
  it('continues SLA in waiting, keeps snapshots when policy changes and recalculates changed priority', async () => {
    const ticket = context.service.create(
      requester,
      ticketInput({ impact: 'high', urgency: 'high' }) as Parameters<TicketService['create']>[1],
    );
    let updated = context.service.update(agent, ticket.id, {
      version: ticket.version,
      status: 'in_progress',
    });
    updated = context.service.update(agent, ticket.id, {
      version: updated.version,
      status: 'waiting',
    });
    expect(
      (
        await request(adminAuth, 'PATCH', '/api/slas/1', {
          responseMinutes: 20,
          resolutionMinutes: 300,
        })
      ).statusCode,
    ).toBe(200);
    expect(context.service.get(ticket.id).resolutionDueAt).toBe(ticket.resolutionDueAt);
    updated = context.service.update(agent, ticket.id, {
      version: updated.version,
      impact: 'low',
      urgency: 'low',
    });
    expect(updated.priority).toBe(4);
    expect(updated.resolutionDueAt).toBe('2026-10-14T12:00:00.000Z');
    time = new Date(baseline.getTime() + 6 * 3600000);
    expect(context.service.get(updated.id).status).toBe('waiting');
    expect(context.service.get(updated.id).resolutionSlaState).toBe('on_track');
    time = new Date(baseline);
    await request(adminAuth, 'PATCH', '/api/slas/1', {
      responseMinutes: 15,
      resolutionMinutes: 240,
    });
  });
  it('allows administrators to disable rules and stores assignment execution plus notification', async () => {
    expect(
      (await request(adminAuth, 'PATCH', '/api/automations/critical', { enabled: false }))
        .statusCode,
    ).toBe(200);
    const ticket = context.service.create(
      requester,
      ticketInput({ impact: 'high', urgency: 'high' }) as Parameters<TicketService['create']>[1],
    );
    expect(
      context.store.get(
        'SELECT id FROM automation_executions WHERE ticketId=? AND ruleId=?',
        ticket.id,
        'critical',
      ),
    ).toBeUndefined();
    context.service.update(agent, ticket.id, { version: ticket.version, assigneeId: agent.id });
    expect(
      context.store.get(
        'SELECT id FROM notifications WHERE ticketId=? AND userId=?',
        ticket.id,
        agent.id,
      ),
    ).toBeTruthy();
    expect(
      (await request(agentAuth, 'GET', '/api/automations')).json().executions.length,
    ).toBeGreaterThan(0);
    await request(adminAuth, 'PATCH', '/api/automations/critical', { enabled: true });
  });
  it('marks owned notifications only and exposes unread counts', async () => {
    const list = (await request(agentAuth, 'GET', '/api/notifications')).json();
    expect(list.unread).toBeGreaterThan(0);
    const note = list.items[0];
    expect(
      (await request(agentAuth, 'PATCH', `/api/notifications/${note.id}`, { read: true }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request(requesterAuth, 'PATCH', `/api/notifications/${note.id}`, { read: true }))
        .statusCode,
    ).toBe(404);
    expect((await request(agentAuth, 'GET', '/api/notifications')).json().unread).toBe(
      list.unread - 1,
    );
  });
  it('marks all owned notifications beyond the visible page and preserves other users', async () => {
    const ticket = context.service.all('t.requesterId=?', [requester.id])[0];
    for (let index = 0; index < 105; index++)
      context.service.notify(
        [requester.id, agent.id],
        `bulk-read-${index}`,
        'Notificação demonstrativa',
        'Atualização de atendimento.',
        ticket.id,
      );
    const own = (await request(requesterAuth, 'GET', '/api/notifications')).json(),
      other = (await request(agentAuth, 'GET', '/api/notifications')).json();
    expect(own.items).toHaveLength(100);
    expect(own.unread).toBeGreaterThan(100);
    expect(
      (
        await context.app.inject({
          method: 'POST',
          url: '/api/notifications/read-all',
          headers: { cookie: requesterAuth.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await request(requesterAuth, 'POST', '/api/notifications/read-all', { userId: agent.id }))
        .statusCode,
    ).toBe(400);
    const response = await request(requesterAuth, 'POST', '/api/notifications/read-all', {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, count: own.unread });
    expect((await request(requesterAuth, 'GET', '/api/notifications')).json().unread).toBe(0);
    expect((await request(agentAuth, 'GET', '/api/notifications')).json().unread).toBe(
      other.unread,
    );
    expect(
      (await request(requesterAuth, 'POST', '/api/notifications/read-all', {})).json(),
    ).toEqual({ ok: true, count: 0 });
  });
  it('builds metrics from persisted data and period filters alter results', async () => {
    const oldClock = time;
    time = new Date(baseline.getTime() - 45 * 86400000);
    context.service.create(agent, ticketInput() as Parameters<TicketService['create']>[1]);
    time = oldClock;
    const short = (await request(agentAuth, 'GET', '/api/dashboard?days=7')).json(),
      long = (await request(agentAuth, 'GET', '/api/dashboard?days=90')).json();
    expect(short.trend).toHaveLength(7);
    expect(long.trend).toHaveLength(90);
    expect(long.metrics.totalIncidents).toBeGreaterThan(short.metrics.totalIncidents);
    const own = (await request(requesterAuth, 'GET', '/api/dashboard?days=90')).json();
    expect(own.recentTickets.every((t: Ticket) => t.requesterId === requester.id)).toBe(true);
    const all = (await request(agentAuth, 'GET', '/api/tickets?days=90')).json(),
      recent = (await request(agentAuth, 'GET', '/api/tickets?days=7')).json();
    expect(all.total).toBeGreaterThan(recent.total);
  });
});

describe('Administration and file persistence', () => {
  it('preserves sessions for profile edits and revokes them for role changes or deactivation', async () => {
    const ownEdit = await request(adminAuth, 'PATCH', `/api/admin/users/${admin.id}`, {
      name: 'Administrador atualizado',
      role: admin.role,
      active: true,
      teamId: admin.teamId,
    });
    expect(ownEdit.statusCode).toBe(200);
    expect((await request(adminAuth, 'GET', '/api/auth/me')).statusCode).toBe(200);
    await request(adminAuth, 'PATCH', `/api/admin/users/${admin.id}`, { name: admin.name });
    const created = await request(adminAuth, 'POST', '/api/admin/users', {
      name: 'Agente de sessão',
      email: 'session-regression@nexusops.local',
      password: PASSWORD,
      role: 'agent',
    });
    expect(created.statusCode).toBe(201);
    const user = created.json() as User;
    const auth = await login(user.email);
    const rename = await request(adminAuth, 'PATCH', `/api/admin/users/${user.id}`, {
      name: 'Agente renomeado',
      role: 'agent',
      active: true,
    });
    expect(rename.statusCode).toBe(200);
    expect((await request(auth, 'GET', '/api/auth/me')).statusCode).toBe(200);
    expect(
      (await request(adminAuth, 'PATCH', `/api/admin/users/${user.id}`, { role: 'requester' }))
        .statusCode,
    ).toBe(200);
    expect((await request(auth, 'GET', '/api/auth/me')).statusCode).toBe(401);
    const nextAuth = await login(user.email);
    expect(
      (await request(adminAuth, 'PATCH', `/api/admin/users/${user.id}`, { active: false }))
        .statusCode,
    ).toBe(200);
    expect((await request(nextAuth, 'GET', '/api/auth/me')).statusCode).toBe(401);
  });
  it('creates/updates teams and users, records audit without password, keeps last administrator', async () => {
    const team = (
      await request(adminAuth, 'POST', '/api/admin/teams', {
        name: 'Equipe de qualidade',
        description: 'Validação de fluxo.',
      })
    ).json();
    expect(
      (
        await request(adminAuth, 'PATCH', `/api/admin/teams/${team.id}`, {
          description: 'Qualidade e revisão.',
        })
      ).statusCode,
    ).toBe(200);
    const result = await request(adminAuth, 'POST', '/api/admin/users', {
      name: 'Usuário de testes',
      email: 'teste@nexusops.local',
      password: PASSWORD,
      role: 'requester',
      teamId: team.id,
    });
    expect(result.statusCode).toBe(201);
    const user = result.json();
    expect(JSON.stringify(user)).not.toContain(PASSWORD);
    expect(
      (await request(adminAuth, 'PATCH', `/api/admin/users/${user.id}`, { active: false }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request(adminAuth, 'PATCH', `/api/admin/users/${admin.id}`, { active: false }))
        .statusCode,
    ).toBe(400);
    const data = (await request(adminAuth, 'GET', '/api/admin')).json();
    expect(JSON.stringify(data)).not.toContain(PASSWORD);
    expect(JSON.stringify(data)).not.toContain('passwordHash');
    expect(data.audit.some((a: { operation: string }) => a.operation === 'user.created')).toBe(
      true,
    );
  });
  it('validates matrix and recalculates new tickets using saved configuration', async () => {
    expect(
      (await request(adminAuth, 'PUT', '/api/admin/priority-matrix', { matrix: [[1]] })).statusCode,
    ).toBe(400);
    expect(
      (
        await request(adminAuth, 'PUT', '/api/admin/priority-matrix', {
          matrix: [
            [3, 3, 2],
            [3, 2, 2],
            [2, 2, 1],
          ],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      context.service.create(
        requester,
        ticketInput({ impact: 'low', urgency: 'low' }) as Parameters<TicketService['create']>[1],
      ).priority,
    ).toBe(3);
    await request(adminAuth, 'PUT', '/api/admin/priority-matrix', {
      matrix: [
        [4, 3, 2],
        [3, 2, 2],
        [2, 2, 1],
      ],
    });
  });
  it('preserves existing priority and SLA snapshots on unrelated edits after matrix changes', async () => {
    const created = (
      await request(
        requesterAuth,
        'POST',
        '/api/tickets',
        ticketInput({ impact: 'high', urgency: 'high' }),
      )
    ).json() as Ticket;
    await request(adminAuth, 'PUT', '/api/admin/priority-matrix', {
      matrix: [
        [4, 3, 2],
        [3, 2, 2],
        [2, 2, 4],
      ],
    });
    const edited = (
      await request(agentAuth, 'PATCH', `/api/tickets/${created.id}`, {
        version: created.version,
        status: 'in_progress',
        assigneeId: agent.id,
      })
    ).json() as Ticket;
    expect(edited.priority).toBe(1);
    expect(edited.impact).toBe('high');
    expect(edited.urgency).toBe('high');
    expect(edited.resolutionDueAt).toBe(created.resolutionDueAt);
    expect(edited.responseDueAt).toBe(created.responseDueAt);
    const newTicket = (
      await request(
        requesterAuth,
        'POST',
        '/api/tickets',
        ticketInput({ impact: 'high', urgency: 'high' }),
      )
    ).json() as Ticket;
    expect(newTicket.priority).toBe(4);
    await request(adminAuth, 'PUT', '/api/admin/priority-matrix', {
      matrix: [
        [4, 3, 2],
        [3, 2, 2],
        [2, 2, 1],
      ],
    });
  });
  it('reopens a file database with rows, sessions and dedup state intact', () => {
    const path = join(temporary, 'persistent.db');
    let store = new Store(path);
    const teamId = randomUUID(),
      userId = randomUUID(),
      now = baseline.toISOString();
    store.run('INSERT INTO teams VALUES (?,?,?,?)', teamId, 'Teste persistente', '', now);
    store.run(
      'INSERT INTO users VALUES (?,?,?,?,?,?,?,?)',
      userId,
      'Agente Persistente',
      'persist@nexusops.local',
      'unused',
      'agent',
      1,
      teamId,
      now,
    );
    const user = publicUser(
      store.get<Omit<User, 'active'> & { active: number }>(
        'SELECT * FROM users WHERE id=?',
        userId,
      )!,
    );
    const service = new TicketService(store, () => baseline),
      ticket = service.create(
        user,
        ticketInput({ impact: 'high', urgency: 'high' }) as Parameters<TicketService['create']>[1],
      );
    store.run(
      'INSERT INTO sessions VALUES (?,?,?,?,?)',
      'hash-only',
      userId,
      'csrf',
      new Date(baseline.getTime() + 3600000).toISOString(),
      now,
    );
    store.close();
    store = new Store(path);
    const reopened = new TicketService(store, () => baseline);
    expect(reopened.get(ticket.id).number).toBe(ticket.number);
    expect(store.get('SELECT userId FROM sessions WHERE tokenHash=?', 'hash-only')).toBeTruthy();
    reopened.tick();
    expect(
      store.get<{ n: number }>(
        'SELECT COUNT(*) n FROM automation_executions WHERE ticketId=? AND ruleId=?',
        ticket.id,
        'critical',
      )!.n,
    ).toBe(1);
    expect(store.get<{ n: number }>('SELECT COUNT(*) n FROM schema_migrations')!.n).toBe(2);
    store.close();
  });
  it('serves built SPA publicly while API remains protected and sets production cookie flags', async () => {
    const staticRoot = join(temporary, 'web-dist');
    mkdirSync(staticRoot);
    writeFileSync(join(staticRoot, 'index.html'), '<html><body>NexusOps built page</body></html>');
    const { app, store } = await buildApp({
      worker: false,
      production: true,
      origins: ['https://nexusops.example'],
      staticRoot,
    });
    try {
      const user = context.store.get<
        Omit<User, 'active'> & { active: number; passwordHash: string; createdAt: string }
      >('SELECT * FROM users WHERE id=?', admin.id)!;
      store.run(
        'INSERT INTO users VALUES (?,?,?,?,?,?,?,?)',
        user.id,
        user.name,
        user.email,
        user.passwordHash,
        user.role,
        1,
        null,
        user.createdAt,
      );
      expect((await app.inject('/incidentes')).body).toContain('NexusOps built page');
      expect((await app.inject('/api/tickets')).statusCode).toBe(401);
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: 'https://nexusops.example' },
        payload: { email: admin.email, password: PASSWORD },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toContain('HttpOnly');
      expect(response.headers['set-cookie']).toContain('SameSite=Lax');
      expect(response.headers['set-cookie']).toContain('Secure');
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
      const cookie = String(response.headers['set-cookie']).split(';')[0];
      expect(
        (await app.inject({ url: '/api/route-not-found', headers: { cookie } })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
