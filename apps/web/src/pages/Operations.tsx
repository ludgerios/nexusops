import { useCallback, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  CircleAlert,
  Download,
  History,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Timer,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { api, invalidate, queryString } from '../api';
import { useWorkspace } from '../context';
import type {
  Automation,
  Dashboard,
  Execution,
  Matrix,
  Notification,
  Policy,
  Team,
  Ticket,
  TicketList,
  User,
} from '../types';
import {
  timezoneLabel,
  Avatar,
  date,
  Empty,
  ErrorState,
  Field,
  Modal,
  Pagination,
  PriorityBadge,
  priorityLabels,
  roleLabels,
  Skeleton,
  SlaBadge,
  Spinner,
  StatusBadge,
  TicketTable,
} from '../ui';

export function SlasPage() {
  const { user, notify } = useWorkspace();
  const query = useQuery({
    queryKey: ['slas'],
    queryFn: () => api<{ policies: Policy[]; records: Ticket[] }>('/slas'),
    refetchInterval: 30_000,
  });
  const [editing, setEditing] = useState<Policy | null>(null);
  const [filter, setFilter] = useState('');
  const close = useCallback(() => setEditing(null), []);
  const mutation = useMutation({
    mutationFn: (policy: Policy) =>
      api(`/slas/${policy.priority}`, {
        method: 'PATCH',
        body: {
          responseMinutes: policy.responseMinutes,
          resolutionMinutes: policy.resolutionMinutes,
        },
      }),
    onSuccess: async () => {
      await invalidate();
      close();
      notify('Política de SLA atualizada. Novos chamados usarão essas metas.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const records =
    query.data?.records.filter(
      (t) => !filter || t.responseSlaState === filter || t.resolutionSlaState === filter,
    ) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="COMPROMISSO COM O SERVIÇO"
        title="Gestão de SLAs"
        description="Prazos claros. Atendimento previsível. Acompanhe cada compromisso."
      />
      {query.isPending ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data && (
          <>
            <div className="info-banner">
              <ShieldCheck size={20} />
              <div>
                <strong>Metas contínuas, 24 horas por dia</strong>
                <p>
                  Primeira resposta ao iniciar o atendimento. Resolução ao resolver o chamado. A
                  espera mantém a contagem. Alterações nas políticas valem para novos chamados.
                </p>
              </div>
              <span className="badge neutral">Fuso: {timezoneLabel}</span>
            </div>
            <div className="policy-grid">
              {query.data.policies.map((p) => (
                <section className={`panel policy-card p${p.priority}`} key={p.priority}>
                  <div className="policy-top">
                    <PriorityBadge priority={p.priority} />
                    {user.role === 'administrator' && (
                      <button
                        className="icon-button"
                        aria-label={`Editar SLA P${p.priority}`}
                        onClick={() => setEditing({ ...p })}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </div>
                  <div>
                    <span>Primeira resposta</span>
                    <strong>{duration(p.responseMinutes)}</strong>
                  </div>
                  <div>
                    <span>Resolução</span>
                    <strong>{duration(p.resolutionMinutes)}</strong>
                  </div>
                  <small>Contagem contínua · 24×7</small>
                </section>
              ))}
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Acompanhamento dos prazos</h2>
                  <p>Primeira resposta e resolução por chamado</p>
                </div>
                <select
                  aria-label="Filtrar estado do SLA"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="">Todos os estados</option>
                  <option value="on_track">Dentro do prazo</option>
                  <option value="at_risk">Próximo do vencimento</option>
                  <option value="breached">Vencido</option>
                  <option value="met">Concluído no prazo</option>
                  <option value="missed">Concluído fora do prazo</option>
                </select>
              </div>
              {records.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Chamado</th>
                        <th>Prioridade</th>
                        <th>Primeira resposta</th>
                        <th>Resolução</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <Link className="ticket-cell" to={`/tickets/${t.id}`}>
                              <span className="ticket-number">{t.number}</span>
                              <strong>{t.title}</strong>
                            </Link>
                          </td>
                          <td>
                            <PriorityBadge priority={t.priority} />
                          </td>
                          <td>
                            <div className="sla-table-cell">
                              <SlaBadge state={t.responseSlaState} />
                              <span>{date(t.responseDueAt)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="sla-table-cell">
                              <SlaBadge state={t.resolutionSlaState} />
                              <span>{date(t.resolutionDueAt)}</span>
                            </div>
                          </td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Nenhum prazo neste estado"
                  description="Selecione outro filtro para acompanhar os chamados."
                />
              )}
            </section>
          </>
        )
      )}
      {editing && (
        <Modal
          title={`Política P${editing.priority} · ${priorityLabels[editing.priority]}`}
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(editing);
            }}
          >
            <div className="modal-body">
              <Field label="Primeira resposta (minutos)">
                <input
                  aria-label="Primeira resposta (minutos)"
                  type="number"
                  required
                  min={1}
                  max={525600}
                  value={editing.responseMinutes}
                  onChange={(e) =>
                    setEditing({ ...editing, responseMinutes: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Resolução (minutos)">
                <input
                  aria-label="Resolução (minutos)"
                  type="number"
                  required
                  min={editing.responseMinutes}
                  max={525600}
                  value={editing.resolutionMinutes}
                  onChange={(e) =>
                    setEditing({ ...editing, resolutionMinutes: Number(e.target.value) })
                  }
                />
              </Field>
              <p className="field-hint">Os prazos de chamados existentes são preservados.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={close}>
                Cancelar
              </button>
              <button className="button primary" type="submit" disabled={mutation.isPending}>
                Salvar política
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function duration(minutes: number) {
  return minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60} h`
      : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="page-eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function AutomationsPage() {
  const { user, notify } = useWorkspace();
  const query = useQuery({
    queryKey: ['automations'],
    queryFn: () => api<{ rules: Automation[]; executions: Execution[] }>('/automations'),
    refetchInterval: 30_000,
  });
  const [editing, setEditing] = useState<Automation | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const mutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; enabled?: boolean; thresholdPercent?: number }) =>
      api(`/automations/${id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await invalidate();
      close();
      notify('Regra de automação atualizada.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  return (
    <>
      <PageHeading
        eyebrow="MENOS REPETIÇÃO, MAIS RESULTADO"
        title="Automações"
        description="Regras que conectam eventos a ações e mantêm a operação um passo à frente."
      />
      {query.isPending ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data && (
          <>
            <div className="automation-summary">
              <div>
                <span className="service-icon violet">
                  <Zap size={23} />
                </span>
                <div>
                  <strong>{query.data.rules.filter((r) => r.enabled).length} regras ativas</strong>
                  <span>Processamento no backend · eventos sem duplicidade</span>
                </div>
              </div>
              <span className="badge sla-on_track">
                <span className="status-dot" />
                Motor de automações
              </span>
            </div>
            <div className="automation-grid">
              {query.data.rules.map((r, i) => (
                <section className="panel automation-card" key={r.id}>
                  <div className="automation-top">
                    <span className={`service-icon ${i % 2 ? 'blue' : 'violet'}`}>
                      {i === 0 ? (
                        <CircleAlert size={20} />
                      ) : i === 3 ? (
                        <Users size={20} />
                      ) : (
                        <Timer size={20} />
                      )}
                    </span>
                    {user.role === 'administrator' ? (
                      <button
                        className={`toggle ${r.enabled ? 'on' : ''}`}
                        role="switch"
                        aria-checked={r.enabled}
                        aria-label={`${r.enabled ? 'Desativar' : 'Ativar'} ${r.name}`}
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: r.id, enabled: !r.enabled })}
                      >
                        <span />
                      </button>
                    ) : (
                      <span className={`badge ${r.enabled ? 'sla-on_track' : 'neutral'}`}>
                        {r.enabled ? 'Ativa' : 'Inativa'}
                      </span>
                    )}
                  </div>
                  <h2>{r.name}</h2>
                  <p>{r.description}</p>
                  <div className="automation-flow">
                    <span>EVENTO</span>
                    <code>{r.event}</code>
                    <ArrowRight size={15} />
                    <span>AÇÃO AUTOMÁTICA</span>
                  </div>
                  <div className="automation-bottom">
                    <span>
                      Última execução <strong>{date(r.lastExecutedAt)}</strong>
                    </span>
                    <span>
                      {r.lastResult === 'success'
                        ? 'Sucesso'
                        : r.lastResult === 'failed'
                          ? 'Falha'
                          : 'Aguardando evento'}
                    </span>
                  </div>
                  {user.role === 'administrator' && r.id === 'sla-near' && (
                    <button className="text-link" onClick={() => setEditing({ ...r })}>
                      <Settings2 size={14} />
                      Configurar limiar ({r.thresholdPercent}%)
                    </button>
                  )}
                </section>
              ))}
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Histórico de execução</h2>
                  <p>Rastreabilidade das ações automáticas</p>
                </div>
                <History size={18} className="muted" />
              </div>
              {query.data.executions.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Regra</th>
                        <th>Chamado</th>
                        <th>Resultado</th>
                        <th>Detalhes</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.executions.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <strong>{e.ruleName}</strong>
                          </td>
                          <td>
                            <Link className="ticket-number" to={`/tickets/${e.ticketId}`}>
                              {e.ticketNumber}
                            </Link>
                          </td>
                          <td>
                            <span
                              className={`badge ${e.status === 'failed' ? 'sla-breached' : 'sla-met'}`}
                            >
                              {e.status === 'failed' ? 'Falha' : 'Executada'}
                            </span>
                          </td>
                          <td>{e.message}</td>
                          <td className="muted">{date(e.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Aguardando os primeiros eventos"
                  description="As execuções serão registradas assim que uma regra for acionada."
                />
              )}
            </section>
          </>
        )
      )}
      {editing && (
        <Modal title="Configurar automação" onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                id: editing.id,
                enabled: editing.enabled,
                thresholdPercent: editing.thresholdPercent,
              });
            }}
          >
            <div className="modal-body">
              <h3>{editing.name}</h3>
              <Field
                label="Percentual consumido para alertar"
                hint="Ao atingir este percentual da meta, o backend gera o alerta uma única vez."
              >
                <input
                  aria-label="Percentual consumido para alertar"
                  type="number"
                  min={1}
                  max={99}
                  required
                  value={editing.thresholdPercent}
                  onChange={(e) =>
                    setEditing({ ...editing, thresholdPercent: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <div className="modal-footer">
              <button className="button secondary" type="button" onClick={close}>
                Cancelar
              </button>
              <button className="button primary" disabled={mutation.isPending} type="submit">
                Salvar regra
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function NotificationsPage() {
  const { notify } = useWorkspace();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: Notification[]; unread: number }>('/notifications'),
    refetchInterval: 30_000,
  });
  const mutation = useMutation({
    mutationFn: (ids: string[] | null) =>
      ids === null
        ? api('/notifications/read-all', { method: 'POST', body: {} })
        : Promise.all(
            ids.map((id) => api(`/notifications/${id}`, { method: 'PATCH', body: { read: true } })),
          ),
    onSuccess: async () => {
      await invalidate();
      notify('Notificações marcadas como lidas.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const items = query.data?.items.filter((n) => !onlyUnread || !n.read) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="FIQUE POR DENTRO"
        title="Notificações"
        description="Atribuições, atualizações e alertas importantes da sua operação."
        action={
          <button
            className="button secondary"
            disabled={!query.data?.unread || mutation.isPending}
            onClick={() => mutation.mutate(null)}
          >
            <CheckCheck size={16} />
            Marcar todas como lidas
          </button>
        }
      />
      <section className="panel notifications-panel">
        <div className="tabs">
          <button onClick={() => setOnlyUnread(false)} className={!onlyUnread ? 'active' : ''}>
            Todas<span>{query.data?.items.length ?? 0}</span>
          </button>
          <button onClick={() => setOnlyUnread(true)} className={onlyUnread ? 'active' : ''}>
            Não lidas<span>{query.data?.unread ?? 0}</span>
          </button>
        </div>
        {query.isPending ? (
          <Spinner />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : items.length ? (
          <div className="notifications-list">
            {items.map((n) => (
              <article className={`notification ${n.read ? 'read' : 'unread'}`} key={n.id}>
                <span className={`service-icon ${/SLA/i.test(n.title) ? 'orange' : 'violet'}`}>
                  {/SLA/i.test(n.title) ? <Timer size={20} /> : <Bell size={20} />}
                </span>
                <div className="notification-content">
                  <div>
                    <h2>{n.title}</h2>
                    {!n.read && <span className="unread-dot" />}
                  </div>
                  <p>{n.body}</p>
                  <div className="notification-meta">
                    <time>{date(n.createdAt)}</time>
                    {n.ticketId && (
                      <Link
                        to={`/tickets/${n.ticketId}`}
                        onClick={() => {
                          if (!n.read) mutation.mutate([n.id]);
                        }}
                      >
                        {n.ticketNumber ?? 'Ver chamado'}
                        <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </div>
                {!n.read && (
                  <button
                    className="icon-button"
                    aria-label={`Marcar como lida: ${n.title}`}
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate([n.id])}
                  >
                    <Check size={18} />
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={onlyUnread ? 'Você está em dia' : 'Nenhuma notificação'}
            description="Os próximos alertas e atualizações aparecerão aqui."
          />
        )}
      </section>
    </>
  );
}
function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function ReportsPage() {
  const { notify } = useWorkspace();
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const dashboard = useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => api<Dashboard>(`/dashboard?days=${days}`),
  });
  const list = useQuery({
    queryKey: ['report-tickets', kind, page, days],
    queryFn: () => api<TicketList>(`/tickets?${queryString({ kind, page, limit: 20, days })}`),
  });
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: Ticket[] = [];
      let current = 1,
        total = 1;
      while (rows.length < total) {
        const result = await api<TicketList>(
          `/tickets?${queryString({ kind, page: current, limit: 100, days })}`,
        );
        rows.push(...result.items);
        total = result.total;
        if (!result.items.length) break;
        current++;
      }
      const heading = [
        'Número',
        'Tipo',
        'Título',
        'Categoria',
        'Prioridade',
        'Status',
        'Solicitante',
        'Responsável',
        'Equipe',
        'Criação UTC',
        'Atualização UTC',
        'SLA resposta',
        'SLA resolução',
      ];
      const body = rows.map((t) =>
        [
          t.number,
          t.kind,
          t.title,
          t.category,
          `P${t.priority}`,
          t.status,
          t.requesterName,
          t.assigneeName,
          t.teamName,
          t.createdAt,
          t.updatedAt,
          t.responseSlaState,
          t.resolutionSlaState,
        ]
          .map(csvCell)
          .join(';'),
      );
      const blob = new Blob(['\uFEFF' + [heading.map(csvCell).join(';'), ...body].join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexusops-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`${rows.length} registros exportados.`);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="DADOS QUE ORIENTAM DECISÕES"
        title="Relatórios"
        description="Uma visão operacional baseada nos registros reais do seu workspace."
        action={
          <div className="heading-actions">
            <select
              aria-label="Período dos relatórios"
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
            <button
              className="button primary"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              <Download size={17} />
              {exporting ? 'Exportando…' : 'Exportar CSV'}
            </button>
          </div>
        }
      />
      {dashboard.isPending ? (
        <Skeleton />
      ) : dashboard.error ? (
        <ErrorState error={dashboard.error} />
      ) : (
        dashboard.data && (
          <div className="report-metrics">
            {[
              ['Incidentes no período', dashboard.data.metrics.totalIncidents],
              ['Incidentes resolvidos', dashboard.data.metrics.resolvedIncidents],
              ['Problemas ativos', dashboard.data.metrics.activeProblems],
              ['SLAs cumpridos', `${dashboard.data.metrics.slaCompliance.toFixed(1)}%`],
            ].map(([label, value]) => (
              <div className="panel report-metric" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Registros do período</h2>
            <p>O CSV inclui todos os registros que correspondem ao filtro</p>
          </div>
          <select
            aria-label="Tipo de registro no relatório"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os tipos</option>
            <option value="incident">Incidentes</option>
            <option value="problem">Problemas</option>
            <option value="request">Solicitações</option>
          </select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.refetch()} />
        ) : (
          list.data && (
            <>
              <TicketTable tickets={list.data.items} />
              <Pagination
                page={page}
                pageSize={list.data.pageSize}
                total={list.data.total}
                onPage={setPage}
              />
            </>
          )
        )}
      </section>
    </>
  );
}
interface Audit {
  id: string;
  actorName: string;
  operation: string;
  entityType: string;
  entityId: string;
  details: object;
  createdAt: string;
}
interface AdminData {
  users: User[];
  teams: Team[];
  audit: Audit[];
  priorityMatrix: Matrix;
}
export function AdminPage() {
  const { notify } = useWorkspace();
  const [tab, setTab] = useState('users');
  const [userForm, setUserForm] = useState<User | 'new' | null>(null);
  const [teamForm, setTeamForm] = useState<Team | 'new' | null>(null);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const query = useQuery({ queryKey: ['admin'], queryFn: () => api<AdminData>('/admin') });
  const closeUser = useCallback(() => setUserForm(null), []);
  const closeTeam = useCallback(() => setTeamForm(null), []);
  const matrixMutation = useMutation({
    mutationFn: () => api('/admin/priority-matrix', { method: 'PUT', body: { matrix } }),
    onSuccess: async () => {
      await invalidate();
      setMatrix(null);
      notify('Matriz de prioridade atualizada. Novos chamados usarão a nova matriz.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const activeMatrix = matrix ?? query.data?.priorityMatrix;
  return (
    <>
      <PageHeading
        eyebrow="CONFIGURAÇÕES DO WORKSPACE"
        title="Administração"
        description="Pessoas, equipes e regras para uma operação bem organizada."
        action={
          tab === 'users' ? (
            <button className="button primary" onClick={() => setUserForm('new')}>
              <Plus size={17} />
              Novo usuário
            </button>
          ) : tab === 'teams' ? (
            <button className="button primary" onClick={() => setTeamForm('new')}>
              <Plus size={17} />
              Nova equipe
            </button>
          ) : undefined
        }
      />
      <section className="panel admin-panel">
        <div className="tabs">
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
            <Users size={16} />
            Usuários
          </button>
          <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>
            <Workflow size={16} />
            Equipes
          </button>
          <button className={tab === 'matrix' ? 'active' : ''} onClick={() => setTab('matrix')}>
            <Settings2 size={16} />
            Prioridades
          </button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
            <ShieldCheck size={16} />
            Auditoria
          </button>
        </div>
        {query.isPending ? (
          <Spinner />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          query.data && (
            <>
              {tab === 'users' && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Perfil</th>
                        <th>Equipe</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="person">
                              <Avatar name={u.name} />
                              <div>
                                <strong>{u.name}</strong>
                                <small>{u.email}</small>
                              </div>
                            </div>
                          </td>
                          <td>{roleLabels[u.role]}</td>
                          <td>{query.data?.teams.find((t) => t.id === u.teamId)?.name ?? '—'}</td>
                          <td>
                            <span className={`badge ${u.active ? 'sla-met' : 'neutral'}`}>
                              {u.active ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`Editar usuário ${u.name}`}
                              onClick={() => setUserForm(u)}
                            >
                              <Pencil size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {tab === 'teams' && (
                <div className="teams-grid">
                  {query.data.teams.map((t) => (
                    <article className="team-card" key={t.id}>
                      <span className="service-icon blue">
                        <Users size={22} />
                      </span>
                      <div>
                        <h2>{t.name}</h2>
                        <p>{t.description || 'Equipe de atendimento'}</p>
                        <span>
                          {t.memberCount ??
                            query.data?.users.filter((u) => u.teamId === t.id).length}{' '}
                          integrantes
                        </span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Editar equipe ${t.name}`}
                        onClick={() => setTeamForm(t)}
                      >
                        <Pencil size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {tab === 'matrix' && activeMatrix && (
                <div className="matrix-wrap">
                  <div className="matrix-description">
                    <span className="service-icon violet">
                      <Settings2 size={24} />
                    </span>
                    <h2>Matriz de impacto e urgência</h2>
                    <p>
                      A prioridade é calculada no backend a partir destas combinações. P1 é a mais
                      crítica; P4, a mais baixa. Alterações valem para novos chamados e recálculos
                      de impacto ou urgência.
                    </p>
                  </div>
                  <div className="matrix-table">
                    <div className="matrix-axis">URGÊNCIA →</div>
                    <table>
                      <thead>
                        <tr>
                          <th>Impacto ↓</th>
                          <th>Baixa</th>
                          <th>Média</th>
                          <th>Alta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMatrix.map((row, i) => (
                          <tr key={i}>
                            <th>{['Baixo', 'Médio', 'Alto'][i]}</th>
                            {row.map((value, j) => (
                              <td key={j}>
                                <select
                                  aria-label={`Prioridade para impacto ${['baixo', 'médio', 'alto'][i]} e urgência ${['baixa', 'média', 'alta'][j]}`}
                                  className={`matrix-priority priority-${value}`}
                                  value={value}
                                  onChange={(e) => {
                                    const clone = activeMatrix.map((r) => [...r]);
                                    clone[i][j] = Number(e.target.value);
                                    setMatrix(clone);
                                  }}
                                >
                                  {[1, 2, 3, 4].map((p) => (
                                    <option key={p} value={p}>
                                      P{p} · {priorityLabels[p]}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="matrix-actions">
                    <button
                      className="button secondary"
                      disabled={!matrix}
                      onClick={() => setMatrix(null)}
                    >
                      Descartar alterações
                    </button>
                    <button
                      className="button primary"
                      disabled={!matrix || matrixMutation.isPending}
                      onClick={() => matrixMutation.mutate()}
                    >
                      <Check size={16} />
                      Salvar matriz
                    </button>
                  </div>
                </div>
              )}
              {tab === 'audit' &&
                (query.data.audit.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Operação</th>
                          <th>Responsável</th>
                          <th>Registro afetado</th>
                          <th>Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.audit.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <strong>{a.operation}</strong>
                            </td>
                            <td>{a.actorName}</td>
                            <td>
                              <span className="audit-entity">
                                {a.entityType} <code>{a.entityId}</code>
                              </span>
                            </td>
                            <td className="muted">{date(a.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Nenhum evento de auditoria" />
                ))}
            </>
          )
        )}
      </section>
      {userForm && (
        <UserForm value={userForm} teams={query.data?.teams ?? []} onClose={closeUser} />
      )}{' '}
      {teamForm && <TeamForm value={teamForm} onClose={closeTeam} />}
    </>
  );
}
function UserForm({
  value,
  teams,
  onClose,
}: {
  value: User | 'new';
  teams: Team[];
  onClose: () => void;
}) {
  const { notify } = useWorkspace();
  const initial =
    value === 'new'
      ? { name: '', email: '', role: 'agent', teamId: '', active: true, password: '' }
      : { ...value, teamId: value.teamId ?? '', password: '' };
  const [form, setForm] = useState(initial);
  const mutation = useMutation({
    mutationFn: () =>
      api(value === 'new' ? '/admin/users' : `/admin/users/${value.id}`, {
        method: value === 'new' ? 'POST' : 'PATCH',
        body:
          value === 'new'
            ? {
                name: form.name,
                email: form.email,
                password: form.password,
                role: form.role,
                teamId: form.teamId || null,
              }
            : {
                name: form.name,
                role: form.role,
                active: form.active,
                teamId: form.teamId || null,
              },
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
      notify('Usuário salvo com sucesso.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  return (
    <Modal title={value === 'new' ? 'Novo usuário' : 'Editar usuário'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="modal-body">
          <Field label="Nome">
            <input
              aria-label="Nome"
              required
              minLength={3}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="E-mail">
            <input
              aria-label="E-mail"
              type="email"
              required
              readOnly={value !== 'new'}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          {value === 'new' && (
            <Field
              label={value === 'new' ? 'Senha' : 'Nova senha (opcional)'}
              hint="Mínimo de 12 caracteres."
            >
              <input
                aria-label={value === 'new' ? 'Senha' : 'Nova senha (opcional)'}
                autoComplete="new-password"
                type="password"
                required={value === 'new'}
                minLength={12}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          )}
          <div className="form-grid">
            <Field label="Perfil">
              <select
                aria-label="Perfil"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Equipe">
              <select
                aria-label="Equipe"
                value={form.teamId}
                onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              >
                <option value="">Sem equipe</option>
                {teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {value !== 'new' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Usuário ativo
            </label>
          )}
        </div>
        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : 'Salvar usuário'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TeamForm({ value, onClose }: { value: Team | 'new'; onClose: () => void }) {
  const { notify } = useWorkspace();
  const [form, setForm] = useState(
    value === 'new'
      ? { name: '', description: '' }
      : { name: value.name, description: value.description },
  );
  const mutation = useMutation({
    mutationFn: () =>
      api(value === 'new' ? '/admin/teams' : `/admin/teams/${value.id}`, {
        method: value === 'new' ? 'POST' : 'PATCH',
        body: form,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
      notify('Equipe salva com sucesso.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  return (
    <Modal title={value === 'new' ? 'Nova equipe' : 'Editar equipe'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="modal-body">
          <Field label="Nome da equipe">
            <input
              aria-label="Nome da equipe"
              required
              minLength={3}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Descrição da equipe">
            <textarea
              aria-label="Descrição da equipe"
              rows={3}
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </div>
        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit" disabled={mutation.isPending}>
            Salvar equipe
          </button>
        </div>
      </form>
    </Modal>
  );
}
