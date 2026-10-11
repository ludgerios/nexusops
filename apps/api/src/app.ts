import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { User, TicketStatus } from '@nexusops/shared';
import { Store } from './db.js';
import { ApiError, deny, invalid, missing } from './errors.js';
import { hashPassword, verifyPassword, tokenHash, randomToken, safeEqual } from './security.js';
import {
  TicketService,
  createTicketSchema,
  patchTicketSchema,
  publicUser,
  categories,
  statusSchema,
  kindSchema,
  roleSchema,
  statusNames,
} from './domain.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    session: { tokenHash: string; csrfToken: string } | null;
  }
}
type UserRow = Omit<User, 'active'> & { passwordHash: string; active: number };
interface Options {
  dbPath?: string;
  clock?: () => Date;
  worker?: boolean;
  origins?: string[];
  production?: boolean;
  logger?: boolean;
  intervalMs?: number;
  sessionHours?: number;
  staticRoot?: string;
}
const idParam = z.object({ id: z.string().uuid() });
const admin = (request: FastifyRequest) => {
  if (request.user?.role !== 'administrator') deny();
  return request.user;
};
const staff = (request: FastifyRequest) => {
  if (!request.user || request.user.role === 'requester') deny();
  return request.user;
};
export async function buildApp(options: Options = {}) {
  const store = new Store(options.dbPath ?? ':memory:');
  const service = new TicketService(store, options.clock);
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024, trustProxy: false });
  const origins = options.origins ?? ['http://localhost:5173'];
  const production = options.production ?? false;
  const sessionHours = options.sessionHours ?? 12;
  const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/' };
  const dummyHash = await hashPassword(randomToken());
  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  await app.register(cookie);
  await app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  await app.register(rateLimit, { global: false });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'no-referrer')
      .header('Cache-Control', 'no-store');
    if (production)
      reply
        .header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        .header(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
        );
    return payload;
  });
  app.addHook('preHandler', async (request) => {
    // Gate the matched route, including percent-encoded aliases, rather than the raw URL prefix.
    const path = request.routeOptions.url ?? request.url.split('?')[0];
    if (!path.startsWith('/api/') || path === '/api/auth/login') return;
    const token = request.cookies.nexusops_session;
    if (token) {
      const hash = tokenHash(token);
      const session = store.get<{ userId: string; csrfToken: string; expiresAt: string }>(
        'SELECT * FROM sessions WHERE tokenHash=?',
        hash,
      );
      if (session && session.expiresAt > service.now()) {
        const row = store.get<UserRow>(
          'SELECT * FROM users WHERE id=? AND active=1',
          session.userId,
        );
        if (row) {
          request.user = publicUser(row);
          request.session = { tokenHash: hash, csrfToken: session.csrfToken };
        }
      }
    }
    if (!request.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin && !origins.includes(origin)) deny('Origem da requisição não permitida.');
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !safeEqual(csrf, request.session!.csrfToken))
        throw new ApiError(403, 'CSRF_INVALID', 'Token de segurança inválido. Atualize a sessão.');
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const failure: Error & { statusCode?: number } =
      error instanceof Error ? error : new Error('Unknown API error');
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Verifique os campos informados.',
          fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    if (error instanceof ApiError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if ('statusCode' in failure && failure.statusCode === 429)
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
        },
      });
    if ('statusCode' in failure && failure.statusCode && failure.statusCode < 500)
      return reply
        .code(failure.statusCode)
        .send({ error: { code: 'INVALID_REQUEST', message: 'Requisição inválida.' } });
    if (failure.message.includes('UNIQUE constraint failed'))
      return reply
        .code(409)
        .send({ error: { code: 'CONFLICT', message: 'Já existe um registro com esses dados.' } });
    request.log.error({ err: error }, 'Unhandled API failure');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' },
    });
  });
  app.get('/health', async () => ({
    status: 'ok',
    database: store.get<{ ok: number }>('SELECT 1 ok')?.ok === 1 ? 'ok' : 'error',
    version: '1.0.0',
  }));
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      if (request.headers.origin && !origins.includes(request.headers.origin))
        deny('Origem da requisição não permitida.');
      const input = z
        .object({
          email: z
            .string()
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(request.body);
      const key = tokenHash(input.email);
      const attempts = store.get<{ count: number; resetAt: string }>(
        'SELECT * FROM login_attempts WHERE key=?',
        key,
      );
      if (attempts && attempts.resetAt > service.now() && attempts.count >= 10)
        throw new ApiError(
          429,
          'RATE_LIMITED',
          'Muitas tentativas. Tente novamente em 15 minutos.',
        );
      const row = store.get<UserRow>('SELECT * FROM users WHERE email=?', input.email);
      const valid = await verifyPassword(input.password, row?.passwordHash ?? dummyHash);
      if (!row || !row.active || !valid) {
        const resetAt = new Date(service.clock().getTime() + 15 * 60 * 1000).toISOString();
        store.run(
          'INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resetAt<=? THEN 1 ELSE count+1 END, resetAt=CASE WHEN resetAt<=? THEN excluded.resetAt ELSE resetAt END',
          key,
          resetAt,
          service.now(),
          service.now(),
        );
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
      }
      const token = randomToken(),
        csrfToken = randomToken(),
        now = service.now();
      store.transaction(() => {
        store.run('DELETE FROM login_attempts WHERE key=?', key);
        if (request.cookies.nexusops_session)
          store.run(
            'DELETE FROM sessions WHERE tokenHash=?',
            tokenHash(request.cookies.nexusops_session),
          );
        store.run(
          'INSERT INTO sessions VALUES (?,?,?,?,?)',
          tokenHash(token),
          row.id,
          csrfToken,
          new Date(service.clock().getTime() + sessionHours * 3600000).toISOString(),
          now,
        );
        service.audit(row.id, 'auth.login', 'user', row.id, {});
      });
      reply.setCookie('nexusops_session', token, { ...cookieOptions, maxAge: sessionHours * 3600 });
      return { user: publicUser(row), csrfToken };
    },
  );
  app.get('/api/auth/me', async (request) => ({
    user: request.user,
    csrfToken: request.session!.csrfToken,
  }));
  app.post('/api/auth/logout', async (request, reply) => {
    store.run('DELETE FROM sessions WHERE tokenHash=?', request.session!.tokenHash);
    service.audit(request.user!.id, 'auth.logout', 'user', request.user!.id, {});
    reply.clearCookie('nexusops_session', cookieOptions);
    return { ok: true };
  });
  app.get('/api/meta', async (request) => ({
    users: store
      .all<UserRow>(
        `SELECT * FROM users WHERE active=1 ${request.user!.role === 'requester' ? "AND (role IN ('agent','administrator') OR id=?)" : ''} ORDER BY name`,
        ...(request.user!.role === 'requester' ? [request.user!.id] : []),
      )
      .map(publicUser),
    teams: store.all('SELECT id,name,description FROM teams ORDER BY name'),
    categories,
    priorityMatrix: service.matrix(),
  }));
  app.get('/api/tickets', async (request) => {
    const query = z
      .object({
        kind: kindSchema.optional(),
        status: statusSchema.optional(),
        priority: z.coerce.number().int().min(1).max(4).optional(),
        category: z.string().max(80).optional(),
        teamId: z.string().uuid().optional(),
        assigneeId: z.string().uuid().optional(),
        search: z.string().max(200).optional(),
        days: z.coerce.number().int().min(1).max(365).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);
    const filters: string[] = [],
      values: (string | number)[] = [];
    if (request.user!.role === 'requester') {
      filters.push('t.requesterId=?', "t.kind!='problem'");
      values.push(request.user!.id);
    }
    for (const key of ['kind', 'status', 'priority', 'category', 'teamId', 'assigneeId'] as const)
      if (query[key] !== undefined) {
        filters.push(`t.${key}=?`);
        values.push(query[key]!);
      }
    if (query.days) {
      const cutoff = new Date(service.clock().getTime() - (query.days - 1) * 86400000);
      cutoff.setUTCHours(0, 0, 0, 0);
      filters.push('t.createdAt>=?');
      values.push(cutoff.toISOString());
    }
    if (query.search) {
      filters.push(
        "(t.title LIKE ? ESCAPE '\\' OR t.number LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')",
      );
      const term = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      values.push(term, term, term);
    }
    const where = filters.join(' AND ') || '1=1';
    const total = store.get<{ total: number }>(
      `SELECT COUNT(*) total FROM tickets t WHERE ${where}`,
      ...values,
    )!.total;
    const items = service.all(where, values, {
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return { items, total, page: query.page, pageSize: query.limit };
  });
  app.post('/api/tickets', async (request, reply) => {
    const ticket = service.create(request.user!, createTicketSchema.parse(request.body));
    reply.code(201);
    return ticket;
  });
  app.get('/api/tickets/:id', async (request) =>
    service.detail(request.user!, idParam.parse(request.params).id),
  );
  app.patch('/api/tickets/:id', async (request) =>
    service.update(
      request.user!,
      idParam.parse(request.params).id,
      patchTicketSchema.parse(request.body),
    ),
  );
  app.post('/api/tickets/:id/comments', async (request, reply) => {
    const input = z
      .object({ body: z.string().trim().min(1).max(10000), internal: z.boolean().default(false) })
      .strict()
      .parse(request.body);
    reply.code(201);
    return service.comment(
      request.user!,
      idParam.parse(request.params).id,
      input.body,
      input.internal,
    );
  });
  app.post('/api/tickets/:id/relations', async (request) => {
    const input = z.object({ incidentId: z.string().uuid() }).strict().parse(request.body);
    return service.relate(request.user!, idParam.parse(request.params).id, input.incidentId);
  });
  app.delete('/api/tickets/:id/relations/:incidentId', async (request) => {
    const params = z
      .object({ id: z.string().uuid(), incidentId: z.string().uuid() })
      .parse(request.params);
    return service.relate(request.user!, params.id, params.incidentId, true);
  });
  app.get('/api/dashboard', async (request) => {
    const { days } = z
      .object({
        days: z.coerce
          .number()
          .refine((v) => [7, 30, 90].includes(v))
          .default(30),
      })
      .parse(request.query);
    const now = service.clock(),
      cutoff = new Date(now.getTime() - (days - 1) * 86400000);
    cutoff.setUTCHours(0, 0, 0, 0);
    const where =
      request.user!.role === 'requester'
        ? "t.requesterId=? AND t.kind!='problem' AND t.createdAt>=?"
        : 't.createdAt>=?';
    const all = service.all(
      where,
      request.user!.role === 'requester'
        ? [request.user!.id, cutoff.toISOString()]
        : [cutoff.toISOString()],
    );
    const incidents = all.filter((t) => t.kind === 'incident'),
      finished = (status: TicketStatus) => ['resolved', 'closed', 'cancelled'].includes(status);
    const live = all.filter((t) => !finished(t.status)),
      completed = all.filter((t) => t.resolvedAt && t.status !== 'cancelled');
    const met = completed.filter((t) => t.resolutionSlaState === 'met').length,
      missed = completed.length - met;
    const breached = live.filter(
      (t) => t.resolutionSlaState === 'breached' || t.responseSlaState === 'breached',
    ).length;
    const trend = Array.from({ length: days }, (_, i) => {
      const date = new Date(cutoff.getTime() + i * 86400000).toISOString().slice(0, 10);
      return {
        date,
        created: incidents.filter((t) => t.createdAt.slice(0, 10) === date).length,
        resolved: incidents.filter(
          (t) => t.resolvedAt?.slice(0, 10) === date && t.status !== 'cancelled',
        ).length,
      };
    });
    return {
      metrics: {
        totalIncidents: incidents.length,
        openIncidents: incidents.filter((t) => !finished(t.status)).length,
        resolvedIncidents: incidents.filter((t) => ['resolved', 'closed'].includes(t.status))
          .length,
        criticalIncidents: incidents.filter((t) => t.priority === 1 && !finished(t.status)).length,
        activeProblems: live.filter((t) => t.kind === 'problem').length,
        pendingRequests: live.filter((t) => t.kind === 'request').length,
        breachedSlas: breached,
        slaCompliance: completed.length ? Math.round((met / completed.length) * 100) : 0,
      },
      trend,
      priorities: [1, 2, 3, 4].map((p) => ({
        name: `P${p}`,
        value: incidents.filter((t) => t.priority === p).length,
      })),
      statuses: Object.entries(statusNames).map(([status, name]) => ({
        name,
        value: incidents.filter((t) => t.status === status).length,
      })),
      sla: [
        { name: 'Concluído no prazo', value: met },
        { name: 'Concluído fora do prazo', value: missed },
        { name: 'Vencido', value: breached },
        { name: 'Em acompanhamento', value: live.length - breached },
      ],
      recentTickets: all.slice(0, 6),
    };
  });
  app.get('/api/slas', async (request) => {
    staff(request);
    return {
      policies: store.all('SELECT * FROM sla_policies ORDER BY priority'),
      records: service.all("t.status!='cancelled'"),
    };
  });
  app.patch('/api/slas/:priority', async (request) => {
    const user = admin(request);
    const { priority } = z
      .object({ priority: z.coerce.number().int().min(1).max(4) })
      .parse(request.params);
    const input = z
      .object({
        responseMinutes: z.number().int().min(1).max(525600),
        resolutionMinutes: z.number().int().min(1).max(525600),
      })
      .strict()
      .refine((p) => p.resolutionMinutes >= p.responseMinutes, {
        message: 'Resolução deve ser maior ou igual à primeira resposta.',
      })
      .parse(request.body);
    store.transaction(() => {
      store.run(
        'UPDATE sla_policies SET responseMinutes=?,resolutionMinutes=? WHERE priority=?',
        input.responseMinutes,
        input.resolutionMinutes,
        priority,
      );
      service.audit(user.id, 'sla.policy_updated', 'slaPolicy', String(priority), input);
    });
    return { priority, ...input };
  });
  app.get('/api/automations', async (request) => {
    staff(request);
    const rules = store
      .all<
        Record<string, unknown>
      >(`SELECT r.*,(SELECT MAX(createdAt) FROM automation_executions WHERE ruleId=r.id) lastExecutedAt,(SELECT status FROM automation_executions WHERE ruleId=r.id ORDER BY createdAt DESC,rowid DESC LIMIT 1) lastResult FROM automation_rules r ORDER BY rowid`)
      .map((r) => ({ ...r, enabled: !!r.enabled }));
    const executions = store.all(
      `SELECT e.id,e.ruleId,r.name ruleName,e.ticketId,t.number ticketNumber,e.status,e.message,e.createdAt FROM automation_executions e JOIN automation_rules r ON r.id=e.ruleId JOIN tickets t ON t.id=e.ticketId ORDER BY e.createdAt DESC,e.rowid DESC LIMIT 100`,
    );
    return { rules, executions };
  });
  app.patch('/api/automations/:id', async (request) => {
    const user = admin(request);
    const { id } = z
      .object({ id: z.enum(['critical', 'sla-near', 'sla-breach', 'assignment']) })
      .parse(request.params);
    const input = z
      .object({
        enabled: z.boolean(),
        thresholdPercent: z.number().int().min(1).max(99).optional(),
      })
      .strict()
      .parse(request.body);
    if (input.thresholdPercent !== undefined && id !== 'sla-near')
      invalid('O limiar é configurável somente na regra de SLA próximo do vencimento.');
    if (!store.get('SELECT id FROM automation_rules WHERE id=?', id)) missing();
    store.transaction(() => {
      store.run(
        'UPDATE automation_rules SET enabled=?,thresholdPercent=COALESCE(?,thresholdPercent) WHERE id=?',
        Number(input.enabled),
        input.thresholdPercent ?? null,
        id,
      );
      service.audit(user.id, 'automation.updated', 'automationRule', id, input);
    });
    const rule = store.get<Record<string, unknown>>(
      'SELECT * FROM automation_rules WHERE id=?',
      id,
    )!;
    return { ...rule, enabled: !!rule.enabled };
  });
  app.get('/api/notifications', async (request) => ({
    items: store
      .all<
        Record<string, unknown>
      >('SELECT n.id,n.title,n.body,n.ticketId,t.number ticketNumber,n.read,n.createdAt FROM notifications n LEFT JOIN tickets t ON t.id=n.ticketId WHERE n.userId=? ORDER BY n.createdAt DESC,n.rowid DESC LIMIT 100', request.user!.id)
      .map((n) => ({ ...n, read: !!n.read })),
    unread: store.get<{ count: number }>(
      'SELECT COUNT(*) count FROM notifications WHERE userId=? AND read=0',
      request.user!.id,
    )!.count,
  }));
  app.post('/api/notifications/read-all', async (request) => {
    z.object({}).strict().parse(request.body);
    const result = store.run(
      'UPDATE notifications SET read=1 WHERE userId=? AND read=0',
      request.user!.id,
    );
    return { ok: true, count: Number(result.changes) };
  });
  app.patch('/api/notifications/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    z.object({ read: z.literal(true) })
      .strict()
      .parse(request.body);
    const result = store.run(
      'UPDATE notifications SET read=1 WHERE id=? AND userId=?',
      id,
      request.user!.id,
    );
    if (!Number(result.changes)) missing();
    return { ok: true };
  });
  app.get('/api/admin', async (request) => {
    admin(request);
    return {
      users: store.all<UserRow>('SELECT * FROM users ORDER BY name').map(publicUser),
      teams: store.all(
        'SELECT t.*,(SELECT COUNT(*) FROM users WHERE teamId=t.id AND active=1) memberCount FROM teams t ORDER BY name',
      ),
      audit: store
        .all<
          Record<string, unknown>
        >("SELECT a.*,COALESCE(u.name,'Sistema NexusOps') actorName FROM audit_logs a LEFT JOIN users u ON u.id=a.actorId ORDER BY a.createdAt DESC,a.rowid DESC LIMIT 100")
        .map((a) => ({ ...a, details: JSON.parse(String(a.details)) })),
      priorityMatrix: service.matrix(),
    };
  });
  app.post('/api/admin/users', async (request, reply) => {
    const actor = admin(request);
    const input = z
      .object({
        name: z.string().trim().min(3).max(120),
        email: z
          .string()
          .email()
          .max(254)
          .transform((s) => s.toLowerCase()),
        password: z.string().min(12).max(256),
        role: roleSchema,
        teamId: z.string().uuid().nullable().optional(),
      })
      .strict()
      .parse(request.body);
    service.verifyAssignment(null, input.teamId);
    const passwordHash = await hashPassword(input.password),
      id = randomUUID();
    store.transaction(() => {
      store.run(
        'INSERT INTO users VALUES (?,?,?,?,?,?,?,?)',
        id,
        input.name,
        input.email,
        passwordHash,
        input.role,
        1,
        input.teamId ?? null,
        service.now(),
      );
      service.audit(actor.id, 'user.created', 'user', id, {
        name: input.name,
        email: input.email,
        role: input.role,
        teamId: input.teamId ?? null,
      });
    });
    reply.code(201);
    return publicUser(store.get<UserRow>('SELECT * FROM users WHERE id=?', id)!);
  });
  app.patch('/api/admin/users/:id', async (request) => {
    const actor = admin(request),
      { id } = idParam.parse(request.params);
    const input = z
      .object({
        name: z.string().trim().min(3).max(120).optional(),
        role: roleSchema.optional(),
        active: z.boolean().optional(),
        teamId: z.string().uuid().nullable().optional(),
      })
      .strict()
      .refine((p) => Object.keys(p).length > 0)
      .parse(request.body);
    const old = store.get<UserRow>('SELECT * FROM users WHERE id=?', id);
    if (!old) missing();
    service.verifyAssignment(null, input.teamId);
    if (
      old.role === 'administrator' &&
      old.active &&
      ((input.role && input.role !== 'administrator') || input.active === false) &&
      store.get<{ n: number }>(
        "SELECT COUNT(*) n FROM users WHERE role='administrator' AND active=1",
      )!.n <= 1
    )
      invalid('Mantenha pelo menos um administrador ativo.');
    if (
      input.role === 'requester' &&
      store.get(
        'SELECT id FROM tickets WHERE assigneeId=? AND status NOT IN (?,?,?)',
        id,
        'closed',
        'resolved',
        'cancelled',
      )
    )
      invalid('Reatribua os chamados ativos antes de tornar este agente solicitante.');
    store.transaction(() => {
      const keys = Object.keys(input) as (keyof typeof input)[];
      store.run(
        `UPDATE users SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`,
        ...keys.map((k) => (k === 'active' ? Number(input[k]) : (input[k] ?? null))),
        id,
      );
      if (input.active === false || (input.role !== undefined && input.role !== old.role))
        store.run('DELETE FROM sessions WHERE userId=?', id);
      service.audit(actor.id, 'user.updated', 'user', id, input);
    });
    return publicUser(store.get<UserRow>('SELECT * FROM users WHERE id=?', id)!);
  });
  const teamSchema = z
    .object({
      name: z.string().trim().min(3).max(120),
      description: z.string().trim().max(1000).default(''),
    })
    .strict();
  app.post('/api/admin/teams', async (request, reply) => {
    const actor = admin(request),
      input = teamSchema.parse(request.body),
      id = randomUUID();
    store.transaction(() => {
      store.run(
        'INSERT INTO teams VALUES (?,?,?,?)',
        id,
        input.name,
        input.description,
        service.now(),
      );
      service.audit(actor.id, 'team.created', 'team', id, input);
    });
    reply.code(201);
    return { id, ...input };
  });
  app.patch('/api/admin/teams/:id', async (request) => {
    const actor = admin(request),
      { id } = idParam.parse(request.params),
      input = teamSchema
        .partial()
        .refine((p) => Object.keys(p).length > 0)
        .parse(request.body);
    if (!store.get('SELECT id FROM teams WHERE id=?', id)) missing();
    store.transaction(() => {
      const keys = Object.keys(input) as (keyof typeof input)[];
      store.run(
        `UPDATE teams SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`,
        ...keys.map((k) => input[k]!),
        id,
      );
      service.audit(actor.id, 'team.updated', 'team', id, input);
    });
    return store.get('SELECT * FROM teams WHERE id=?', id);
  });
  app.put('/api/admin/priority-matrix', async (request) => {
    const actor = admin(request),
      input = z
        .object({ matrix: z.array(z.array(z.number().int().min(1).max(4)).length(3)).length(3) })
        .strict()
        .parse(request.body);
    store.transaction(() => {
      store.run(
        'UPDATE settings SET value=? WHERE key=?',
        JSON.stringify(input.matrix),
        'priorityMatrix',
      );
      service.audit(actor.id, 'priority_matrix.updated', 'settings', 'priorityMatrix', input);
    });
    return { matrix: input.matrix };
  });
  if (options.staticRoot) {
    await app.register(staticFiles, { root: options.staticRoot, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.method !== 'GET')
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
      return reply.sendFile('index.html');
    });
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  if (options.worker !== false) {
    service.tick();
    timer = setInterval(() => {
      try {
        service.tick();
      } catch (error) {
        app.log.error({ err: error }, 'SLA worker failed');
      }
    }, options.intervalMs ?? 30000);
    timer.unref();
  }
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
    store.close();
  });
  await app.ready();
  return { app, store, service };
}
