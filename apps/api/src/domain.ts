import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Ticket, User, Level, TicketStatus, SlaState, AutomationRule } from '@nexusops/shared';
import type { Store } from './db.js';
import { ApiError, deny, invalid, missing } from './errors.js';

export const kindSchema = z.enum(['incident', 'problem', 'request']);
export const statusSchema = z.enum([
  'new',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
  'cancelled',
]);
export const levelSchema = z.enum(['low', 'medium', 'high']);
export const roleSchema = z.enum(['administrator', 'agent', 'requester']);
const optionalText = z.string().trim().max(10000).nullable().optional();
const optionalId = z.string().uuid().nullable().optional();
export const createTicketSchema = z
  .object({
    kind: kindSchema,
    title: z.string().trim().min(5).max(160),
    description: z.string().trim().min(10).max(20000),
    category: z.string().trim().min(2).max(80),
    subcategory: z.string().trim().max(120).nullable().optional(),
    requestType: z.string().trim().min(2).max(120).nullable().optional(),
    impact: levelSchema.default('medium'),
    urgency: levelSchema.default('medium'),
    assigneeId: optionalId,
    teamId: optionalId,
    requesterId: z.string().uuid().optional(),
    rootCause: optionalText,
    workaround: optionalText,
  })
  .strict();
export const patchTicketSchema = createTicketSchema
  .omit({ kind: true, requesterId: true, impact: true, urgency: true })
  .partial()
  .extend({
    version: z.number().int().positive(),
    impact: levelSchema.optional(),
    urgency: levelSchema.optional(),
    status: statusSchema.optional(),
    resolution: optionalText,
  })
  .strict();
export type TicketCreate = z.infer<typeof createTicketSchema>;
export type TicketPatch = z.infer<typeof patchTicketSchema>;
export const transitions: Record<TicketStatus, TicketStatus[]> = {
  new: ['in_progress', 'cancelled'],
  in_progress: ['waiting', 'resolved', 'cancelled'],
  waiting: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};
export const categories = [
  'Infraestrutura',
  'Aplicações',
  'Acesso e identidade',
  'Redes',
  'Equipamentos',
  'Segurança',
  'Software',
];
export const statusNames: Record<TicketStatus, string> = {
  new: 'Novo',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
};
export const SELECT_TICKET = `SELECT t.*, requester.name requesterName, assignee.name assigneeName, team.name teamName,
  s.responseDueAt, s.resolutionDueAt, s.responseAt, s.responseMinutes, s.resolutionMinutes
  FROM tickets t JOIN users requester ON requester.id=t.requesterId LEFT JOIN users assignee ON assignee.id=t.assigneeId
  LEFT JOIN teams team ON team.id=t.teamId JOIN sla_records s ON s.ticketId=t.id`;
type TicketRow = Omit<Ticket, 'responseSlaState' | 'resolutionSlaState'> & {
  responseMinutes: number;
  resolutionMinutes: number;
};
export function slaState(
  dueAt: string,
  completedAt: string | null,
  now: Date,
  startedAt: string,
  thresholdPercent = 80,
): SlaState {
  const due = Date.parse(dueAt);
  if (completedAt) return Date.parse(completedAt) <= due ? 'met' : 'missed';
  if (now.getTime() >= due) return 'breached';
  const start = Date.parse(startedAt);
  return now.getTime() >= start + ((due - start) * thresholdPercent) / 100 ? 'at_risk' : 'on_track';
}
export const plusMinutes = (at: string, minutes: number) =>
  new Date(Date.parse(at) + minutes * 60000).toISOString();
export function publicUser(row: Omit<User, 'active'> & { active: boolean | number }): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: !!row.active,
    teamId: row.teamId,
  };
}

export class TicketService {
  constructor(
    readonly store: Store,
    readonly clock: () => Date = () => new Date(),
  ) {}
  now() {
    return this.clock().toISOString();
  }
  matrix(): number[][] {
    return JSON.parse(
      this.store.get<{ value: string }>('SELECT value FROM settings WHERE key=?', 'priorityMatrix')!
        .value,
    );
  }
  priority(impact: Level, urgency: Level) {
    const levels: Level[] = ['low', 'medium', 'high'];
    return this.matrix()[levels.indexOf(impact)][levels.indexOf(urgency)];
  }
  map(row: TicketRow): Ticket {
    const {
      responseMinutes: _responseMinutes,
      resolutionMinutes: _resolutionMinutes,
      ...ticket
    } = row;
    const threshold =
      this.store.get<{ thresholdPercent: number }>(
        'SELECT thresholdPercent FROM automation_rules WHERE id=?',
        'sla-near',
      )?.thresholdPercent ?? 80;
    return {
      ...ticket,
      responseSlaState: slaState(
        row.responseDueAt,
        row.responseAt,
        this.clock(),
        row.createdAt,
        threshold,
      ),
      resolutionSlaState: slaState(
        row.resolutionDueAt,
        row.resolvedAt,
        this.clock(),
        row.createdAt,
        threshold,
      ),
    };
  }
  get(id: string, user?: User) {
    const row = this.store.get<TicketRow>(`${SELECT_TICKET} WHERE t.id=?`, id);
    if (
      !row ||
      (user?.role === 'requester' && (row.requesterId !== user.id || row.kind === 'problem'))
    )
      missing();
    return this.map(row);
  }
  all(
    where = '1=1',
    values: (string | number)[] = [],
    pagination?: { limit: number; offset: number },
  ) {
    return this.store
      .all<TicketRow>(
        `${SELECT_TICKET} WHERE ${where} ORDER BY t.createdAt DESC,t.rowid DESC${pagination ? ' LIMIT ? OFFSET ?' : ''}`,
        ...values,
        ...(pagination ? [pagination.limit, pagination.offset] : []),
      )
      .map((r) => this.map(r));
  }
  history(
    ticketId: string,
    actorId: string | null,
    event: string,
    description: string,
    internal = false,
  ) {
    this.store.run(
      'INSERT INTO ticket_history VALUES (?,?,?,?,?,?,?)',
      randomUUID(),
      ticketId,
      actorId,
      event,
      description,
      Number(internal),
      this.now(),
    );
  }
  audit(
    actorId: string | null,
    operation: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>,
  ) {
    this.store.run(
      'INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?)',
      randomUUID(),
      actorId,
      operation,
      entityType,
      entityId,
      JSON.stringify(details),
      this.now(),
    );
  }
  verifyAssignment(assigneeId: string | null | undefined, teamId: string | null | undefined) {
    if (teamId && !this.store.get('SELECT id FROM teams WHERE id=?', teamId))
      invalid('Equipe de atendimento não encontrada.');
    if (
      assigneeId &&
      !this.store.get(
        'SELECT id FROM users WHERE id=? AND active=1 AND role IN (?,?)',
        assigneeId,
        'agent',
        'administrator',
      )
    )
      invalid('Responsável precisa ser um agente ativo.');
  }
  create(user: User, input: TicketCreate) {
    if (user.role === 'requester') {
      if (input.kind === 'problem') deny();
      if (input.requesterId && input.requesterId !== user.id) deny();
      if (input.assigneeId) deny('A atribuição de responsáveis é reservada à equipe de suporte.');
    }
    if (input.kind === 'request' && !input.requestType) invalid('Informe o tipo de solicitação.');
    if (input.kind !== 'request' && input.requestType)
      invalid('Tipo de solicitação é exclusivo para solicitações.');
    if (input.kind !== 'problem' && (input.rootCause || input.workaround))
      invalid('Causa raiz e solução de contorno pertencem ao módulo de problemas.');
    const requesterId = input.requesterId ?? user.id;
    if (!this.store.get('SELECT id FROM users WHERE id=? AND active=1', requesterId))
      invalid('Solicitante não encontrado.');
    this.verifyAssignment(input.assigneeId, input.teamId);
    return this.store.transaction(() => {
      const id = randomUUID(),
        now = this.now();
      const count = this.store.get<{ value: number }>(
        'UPDATE counters SET value=value+1 WHERE kind=? RETURNING value',
        input.kind,
      )!.value;
      const number =
        { incident: 'INC', problem: 'PRB', request: 'REQ' }[input.kind] +
        String(count).padStart(7, '0');
      const priority = this.priority(input.impact, input.urgency);
      this.store.run(
        `INSERT INTO tickets (id,number,kind,title,description,category,subcategory,requestType,impact,urgency,priority,status,
        requesterId,assigneeId,teamId,createdAt,updatedAt,rootCause,workaround) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        number,
        input.kind,
        input.title,
        input.description,
        input.category,
        input.subcategory ?? null,
        input.requestType ?? null,
        input.impact,
        input.urgency,
        priority,
        'new',
        requesterId,
        input.assigneeId ?? null,
        input.teamId ?? null,
        now,
        now,
        input.rootCause ?? null,
        input.workaround ?? null,
      );
      const policy = this.store.get<{ responseMinutes: number; resolutionMinutes: number }>(
        'SELECT * FROM sla_policies WHERE priority=?',
        priority,
      )!;
      this.store.run(
        'INSERT INTO sla_records VALUES (?,?,?,?,?,?)',
        id,
        plusMinutes(now, policy.responseMinutes),
        plusMinutes(now, policy.resolutionMinutes),
        input.assigneeId ? now : null,
        policy.responseMinutes,
        policy.resolutionMinutes,
      );
      this.history(id, user.id, 'created', `${number} aberto por ${user.name}.`);
      this.audit(user.id, 'ticket.created', 'ticket', id, { kind: input.kind, number, priority });
      const ticket = this.get(id);
      if (input.kind === 'incident' && priority === 1)
        this.execute(
          'critical',
          ticket,
          `critical:${id}`,
          `Incidente crítico ${number}`,
          ticket.title,
        );
      if (input.assigneeId)
        this.execute(
          'assignment',
          ticket,
          `assignment:${id}:1`,
          `Chamado atribuído: ${number}`,
          `Você é responsável por ${ticket.title}.`,
          [input.assigneeId],
        );
      return this.get(id);
    });
  }
  update(user: User, id: string, input: TicketPatch) {
    const old = this.get(id, user);
    if (old.version !== input.version)
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        'Este chamado foi atualizado por outra pessoa. Recarregue antes de salvar.',
      );
    const { version, ...changes } = input;
    if (Object.keys(changes).length === 0) invalid('Informe ao menos um campo para alterar.');
    if (user.role === 'requester') {
      const permitted = [
        'title',
        'description',
        'category',
        'subcategory',
        'impact',
        'urgency',
        'requestType',
      ];
      if (old.status !== 'new' || Object.keys(changes).some((k) => !permitted.includes(k)))
        deny('Solicitantes podem editar os dados de seus chamados novos.');
    }
    if (old.status === 'closed' || old.status === 'cancelled')
      invalid('Chamados encerrados não podem ser alterados.');
    if (
      input.status &&
      input.status !== old.status &&
      !transitions[old.status].includes(input.status)
    )
      invalid(
        `Transição de ${statusNames[old.status]} para ${statusNames[input.status]} não permitida.`,
      );
    if (old.kind !== 'problem' && (input.rootCause !== undefined || input.workaround !== undefined))
      invalid('Campos de investigação são exclusivos para problemas.');
    if (old.kind !== 'request' && input.requestType !== undefined)
      invalid('Tipo de solicitação é exclusivo para solicitações.');
    if (old.kind === 'request' && input.requestType === null)
      invalid('Informe o tipo de solicitação.');
    const next = { ...old, ...changes };
    if (input.status === 'resolved' && old.status !== 'resolved') {
      if (!next.resolution?.trim()) invalid('Informe a resolução antes de resolver o chamado.');
      if (old.kind === 'problem' && !next.rootCause?.trim())
        invalid('Informe a causa raiz antes de resolver o problema.');
    }
    this.verifyAssignment(next.assigneeId, next.teamId);
    return this.store.transaction(() => {
      const now = this.now();
      const priority =
        input.impact !== undefined || input.urgency !== undefined
          ? this.priority(next.impact, next.urgency)
          : old.priority;
      const fields: Record<string, string | number | null> = {
        ...changes,
        priority,
        updatedAt: now,
        version: version + 1,
      };
      if (input.status && input.status !== old.status) {
        if (input.status === 'resolved' || input.status === 'cancelled') fields.resolvedAt = now;
        else if (old.status === 'resolved' && input.status === 'in_progress')
          fields.resolvedAt = null;
      }
      const keys = Object.keys(fields);
      const result = this.store.run(
        `UPDATE tickets SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=? AND version=?`,
        ...keys.map((k) => fields[k]),
        id,
        version,
      );
      if (Number(result.changes) !== 1)
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          'Chamado atualizado simultaneamente. Recarregue e tente novamente.',
        );
      if (priority !== old.priority) {
        const policy = this.store.get<{ responseMinutes: number; resolutionMinutes: number }>(
          'SELECT * FROM sla_policies WHERE priority=?',
          priority,
        )!;
        this.store.run(
          'UPDATE sla_records SET responseDueAt=?,resolutionDueAt=?,responseMinutes=?,resolutionMinutes=? WHERE ticketId=?',
          plusMinutes(old.createdAt, policy.responseMinutes),
          plusMinutes(old.createdAt, policy.resolutionMinutes),
          policy.responseMinutes,
          policy.resolutionMinutes,
          id,
        );
        this.history(
          id,
          user.id,
          'priority_changed',
          `Prioridade alterada de P${old.priority} para P${priority}.`,
        );
      }
      if (input.status && input.status !== old.status)
        this.history(
          id,
          user.id,
          'status_changed',
          `Status alterado de ${statusNames[old.status]} para ${statusNames[input.status]}.`,
        );
      if (input.assigneeId !== undefined && input.assigneeId !== old.assigneeId)
        this.history(
          id,
          user.id,
          'assigned',
          `Responsável alterado para ${next.assigneeId ? this.store.get<{ name: string }>('SELECT name FROM users WHERE id=?', next.assigneeId)!.name : 'não atribuído'}.`,
        );
      const firstResponse =
        user.role !== 'requester' &&
        (!!input.assigneeId || input.status === 'in_progress' || input.status === 'resolved');
      if (firstResponse) this.respond(id, user.id, now);
      const details = Object.fromEntries(
        Object.entries(changes).filter(([k, v]) => old[k as keyof Ticket] !== v),
      );
      this.audit(user.id, 'ticket.updated', 'ticket', id, { ...details, priority });
      this.history(
        id,
        user.id,
        'updated',
        `Dados do chamado atualizados: ${
          Object.keys(details)
            .map(
              (k) =>
                ({
                  title: 'título',
                  description: 'descrição',
                  category: 'categoria',
                  subcategory: 'subcategoria',
                  impact: 'impacto',
                  urgency: 'urgência',
                  teamId: 'equipe',
                  requestType: 'tipo',
                  rootCause: 'causa raiz',
                  workaround: 'solução de contorno',
                  resolution: 'resolução',
                  status: 'status',
                  assigneeId: 'responsável',
                })[k] ?? k,
            )
            .join(', ') || 'sem alteração de conteúdo'
        }.`,
      );
      const ticket = this.get(id);
      if (input.assigneeId && input.assigneeId !== old.assigneeId)
        this.execute(
          'assignment',
          ticket,
          `assignment:${id}:${version + 1}`,
          `Chamado atribuído: ${ticket.number}`,
          `Você é responsável por ${ticket.title}.`,
          [input.assigneeId],
        );
      if (input.status && input.status !== old.status)
        this.notify(
          [old.requesterId],
          `update:${id}:${version + 1}`,
          `Atualização em ${old.number}`,
          `Status: ${statusNames[input.status]}`,
          id,
        );
      return ticket;
    });
  }
  respond(id: string, actorId: string, at = this.now()) {
    const result = this.store.run(
      'UPDATE sla_records SET responseAt=? WHERE ticketId=? AND responseAt IS NULL',
      at,
      id,
    );
    if (Number(result.changes))
      this.history(
        id,
        actorId,
        'first_response',
        'Primeira resposta da equipe de suporte registrada.',
      );
  }
  comment(user: User, id: string, body: string, internal: boolean) {
    const ticket = this.get(id, user);
    if (internal && user.role === 'requester') deny();
    if (ticket.status === 'closed' || ticket.status === 'cancelled')
      invalid('Chamados encerrados não aceitam comentários.');
    return this.store.transaction(() => {
      const commentId = randomUUID(),
        now = this.now();
      this.store.run(
        'INSERT INTO ticket_comments VALUES (?,?,?,?,?,?)',
        commentId,
        id,
        user.id,
        body,
        Number(internal),
        now,
      );
      this.history(
        id,
        user.id,
        'commented',
        internal ? 'Nota interna registrada.' : 'Comentário registrado.',
        internal,
      );
      if (user.role !== 'requester') this.respond(id, user.id, now);
      this.store.run('UPDATE tickets SET updatedAt=?,version=version+1 WHERE id=?', now, id);
      this.audit(user.id, 'ticket.comment', 'ticket', id, { internal, commentId });
      const recipients = internal
        ? []
        : [ticket.requesterId, ticket.assigneeId].filter((v): v is string => !!v && v !== user.id);
      this.notify(
        recipients,
        `comment:${commentId}`,
        `Comentário em ${ticket.number}`,
        `${user.name} adicionou um comentário.`,
        id,
      );
      return {
        id: commentId,
        ticketId: id,
        authorId: user.id,
        authorName: user.name,
        body,
        internal,
        createdAt: now,
      };
    });
  }
  detail(user: User, id: string) {
    const ticket = this.get(id, user);
    const comments = this.store
      .all<
        Record<string, unknown>
      >(`SELECT c.*,u.name authorName FROM ticket_comments c JOIN users u ON u.id=c.authorId WHERE c.ticketId=? ${user.role === 'requester' ? 'AND c.internal=0' : ''} ORDER BY c.createdAt,c.rowid`, id)
      .map((c) => ({ ...c, internal: !!c.internal }));
    const history = this.store.all<Record<string, unknown>>(
      `SELECT h.id,h.ticketId,h.actorId,h.event,h.description,h.createdAt,COALESCE(u.name,'Sistema NexusOps') actorName FROM ticket_history h LEFT JOIN users u ON u.id=h.actorId WHERE h.ticketId=? ${user.role === 'requester' ? 'AND h.internal=0' : ''} ORDER BY h.createdAt,h.rowid`,
      id,
    );
    const relatedIncidents =
      ticket.kind === 'problem'
        ? this.all('t.id IN (SELECT incidentId FROM problem_incidents WHERE problemId=?)', [id])
        : [];
    const problem = this.store.get<{ problemId: string }>(
      'SELECT problemId FROM problem_incidents WHERE incidentId=?',
      id,
    );
    return {
      ticket,
      comments,
      history,
      relatedIncidents,
      relatedProblem: problem && user.role !== 'requester' ? this.get(problem.problemId) : null,
    };
  }
  relate(user: User, problemId: string, incidentId: string, remove = false) {
    if (user.role === 'requester') deny();
    const problem = this.get(problemId, user),
      incident = this.get(incidentId, user);
    if (problem.kind !== 'problem' || incident.kind !== 'incident')
      invalid('Associe um incidente a um problema.');
    if (['closed', 'cancelled'].includes(problem.status))
      invalid('Problemas encerrados não podem ter relações alteradas.');
    return this.store.transaction(() => {
      const existing = this.store.get<{ problemId: string }>(
        'SELECT problemId FROM problem_incidents WHERE incidentId=?',
        incidentId,
      );
      if (!remove && existing?.problemId === problemId) return { ok: true };
      if (!remove && existing)
        throw new ApiError(409, 'RELATION_CONFLICT', 'Incidente já associado a outro problema.');
      if (remove) {
        if (!existing || existing.problemId !== problemId) missing();
        this.store.run(
          'DELETE FROM problem_incidents WHERE problemId=? AND incidentId=?',
          problemId,
          incidentId,
        );
      } else
        this.store.run(
          'INSERT INTO problem_incidents VALUES (?,?,?)',
          problemId,
          incidentId,
          this.now(),
        );
      const description = `${incident.number} ${remove ? 'desassociado de' : 'associado a'} ${problem.number}.`;
      this.history(problemId, user.id, 'relation_changed', description);
      this.history(incidentId, user.id, 'relation_changed', description, true);
      this.store.run(
        'UPDATE tickets SET updatedAt=?,version=version+1 WHERE id IN (?,?)',
        this.now(),
        problemId,
        incidentId,
      );
      this.audit(user.id, 'problem.relation', 'ticket', problemId, { incidentId, remove });
      return { ok: true };
    });
  }
  notify(userIds: string[], dedupKey: string, title: string, body: string, ticketId: string) {
    for (const id of new Set(userIds))
      this.store.run(
        'INSERT INTO notifications (id,userId,title,body,ticketId,dedupKey,createdAt) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND active=1) ON CONFLICT(userId,dedupKey) DO NOTHING',
        randomUUID(),
        id,
        title,
        body,
        ticketId,
        dedupKey,
        this.now(),
        id,
      );
  }
  execute(
    ruleId: string,
    ticket: Ticket,
    dedupKey: string,
    title: string,
    message: string,
    recipients?: string[],
  ) {
    const rule = this.store.get<Omit<AutomationRule, 'enabled'> & { enabled: number }>(
      'SELECT * FROM automation_rules WHERE id=?',
      ruleId,
    );
    if (
      !rule?.enabled ||
      this.store.get('SELECT id FROM automation_executions WHERE dedupKey=?', dedupKey)
    )
      return false;
    const targets =
      recipients ??
      this.store
        .all<{
          id: string;
        }>('SELECT id FROM users WHERE active=1 AND role IN (?,?)', 'administrator', 'agent')
        .map((u) => u.id);
    this.notify(targets, dedupKey, title, message, ticket.id);
    this.store.run(
      'INSERT INTO automation_executions VALUES (?,?,?,?,?,?,?)',
      randomUUID(),
      ruleId,
      ticket.id,
      dedupKey,
      'success',
      message,
      this.now(),
    );
    this.history(ticket.id, null, `automation.${ruleId}`, `${rule.name}: ${message}`, true);
    if (ruleId === 'sla-breach')
      this.audit(null, 'sla.breached', 'ticket', ticket.id, { ruleId, dedupKey });
    return true;
  }
  tick() {
    this.store.run('DELETE FROM sessions WHERE expiresAt <= ?', this.now());
    this.store.run('DELETE FROM login_attempts WHERE resetAt <= ?', this.now());
    const tickets = this.all("t.status NOT IN ('closed','cancelled')");
    for (const ticket of tickets) {
      for (const metric of ['response', 'resolution'] as const) {
        const completed = metric === 'response' ? ticket.responseAt : ticket.resolvedAt;
        if (completed) continue;
        const state = metric === 'response' ? ticket.responseSlaState : ticket.resolutionSlaState;
        if (state !== 'at_risk' && state !== 'breached') continue;
        const rule = state === 'breached' ? 'sla-breach' : 'sla-near';
        const deadline = metric === 'response' ? ticket.responseDueAt : ticket.resolutionDueAt;
        const dedupKey = `${rule}:${ticket.id}:${metric}:${deadline}`;
        const message = `SLA de ${metric === 'response' ? 'primeira resposta' : 'resolução'} ${state === 'breached' ? 'vencido' : 'próximo do vencimento'} em ${ticket.number}.`;
        try {
          this.store.transaction(() => this.execute(rule, ticket, dedupKey, message, ticket.title));
        } catch (error) {
          // Keep the worker running; failed attempts are persisted and retried at the next interval.
          this.store.run(
            'INSERT INTO automation_executions VALUES (?,?,?,?,?,?,?)',
            randomUUID(),
            rule,
            ticket.id,
            `${dedupKey}:failed:${randomUUID()}`,
            'failed',
            'Falha no processamento; nova tentativa agendada.',
            this.now(),
          );
          this.audit(null, 'automation.failed', 'ticket', ticket.id, {
            ruleId: rule,
            message: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }
    }
  }
}
