import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  FileText,
  Filter,
  History as HistoryIcon,
  Link2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { api, invalidate, queryString } from '../api';
import { useWorkspace } from '../context';
import type { Kind, Meta, Status, Ticket, TicketDetail, TicketList } from '../types';
import {
  timezoneLabel,
  Avatar,
  date,
  Empty,
  ErrorState,
  Field,
  kindLabels,
  Modal,
  Pagination,
  PriorityBadge,
  priorityLabels,
  remaining,
  Skeleton,
  SlaBadge,
  Spinner,
  StatusBadge,
  statusLabels,
  TicketTable,
} from '../ui';

const createSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Use pelo menos 5 caracteres.')
    .max(160, 'Use até 160 caracteres.'),
  description: z
    .string()
    .trim()
    .min(10, 'Descreva o chamado com pelo menos 10 caracteres.')
    .max(10000),
  category: z.string().min(1, 'Selecione uma categoria.'),
  subcategory: z.string().max(100).optional(),
  impact: z.enum(['low', 'medium', 'high']),
  urgency: z.enum(['low', 'medium', 'high']),
  requestType: z.string().optional(),
  teamId: z.string().optional(),
  assigneeId: z.string().optional(),
});
type CreateValues = z.infer<typeof createSchema>;
const plural = { incident: 'Incidentes', problem: 'Problemas', request: 'Solicitações' };
const descriptions = {
  incident: 'Restaure serviços e mantenha sua operação em movimento.',
  problem: 'Investigue causas, conecte incidentes e previna recorrências.',
  request: 'Organize as demandas e entregue os serviços que sua equipe precisa.',
};
const levels = ['low', 'medium', 'high'];
const levelLabels = ['Baixo', 'Médio', 'Alto'];
const requestTypes = [
  'Instalação de software',
  'Solicitação de acesso',
  'Configuração de equipamento',
  'Suporte a aplicação',
  'Recurso de TI',
];
const transitions: Record<Status, Status[]> = {
  new: ['in_progress', 'cancelled'],
  in_progress: ['waiting', 'resolved', 'cancelled'],
  waiting: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};
const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta') });
export function CreateTicket({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const { user, notify } = useWorkspace();
  const meta = useMeta();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      impact: 'medium',
      urgency: 'medium',
      category: '',
      requestType: requestTypes[0],
      teamId: '',
      assigneeId: '',
    },
  });
  const impact = watch('impact'),
    urgency = watch('urgency');
  const priority = meta.data?.priorityMatrix?.[levels.indexOf(impact)]?.[levels.indexOf(urgency)];
  const mutation = useMutation({
    mutationFn: (values: CreateValues) =>
      api<Ticket>('/tickets', {
        method: 'POST',
        body: {
          ...values,
          kind,
          teamId: values.teamId || null,
          assigneeId: values.assigneeId || null,
          ...(kind === 'request' ? {} : { requestType: null }),
        },
      }),
    onSuccess: async (ticket) => {
      await invalidate();
      notify(`${kindLabels[kind]} ${ticket.number} criado com sucesso.`);
      onClose();
      navigate(`/tickets/${ticket.id}`);
    },
    onError: (e) => notify(e.message, 'error'),
  });
  return (
    <Modal
      title={`Nov${kind === 'request' ? 'a solicitação' : kind === 'problem' ? 'o problema' : 'o incidente'}`}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        <div className="modal-body">
          <div className="form-intro">
            <span className="service-icon violet">
              <FileText size={20} />
            </span>
            <p>
              {kind === 'problem'
                ? 'Registre a investigação e acompanhe a solução definitiva.'
                : 'Conte o que aconteceu. As informações certas aceleram o atendimento.'}
            </p>
          </div>
          <Field label="Título" error={errors.title?.message}>
            <input
              aria-label="Título"
              autoFocus
              placeholder={
                kind === 'incident'
                  ? 'Ex.: VPN indisponível para a equipe comercial'
                  : 'Um título claro para o chamado'
              }
              {...register('title')}
            />
          </Field>
          <Field label="Descrição" error={errors.description?.message}>
            <textarea
              aria-label="Descrição"
              rows={4}
              placeholder="Descreva o contexto, os usuários afetados e as informações úteis para atendimento…"
              {...register('description')}
            />
          </Field>
          {kind === 'request' && (
            <Field label="Tipo de solicitação">
              <select aria-label="Tipo de solicitação" {...register('requestType')}>
                {requestTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-grid">
            <Field label="Categoria" error={errors.category?.message}>
              <select aria-label="Categoria" {...register('category')}>
                <option value="">Selecione uma categoria</option>
                {meta.data?.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Subcategoria">
              <input
                aria-label="Subcategoria"
                placeholder="Opcional"
                {...register('subcategory')}
              />
            </Field>
            <Field label="Impacto">
              <select aria-label="Impacto" {...register('impact')}>
                {levels.map((l, i) => (
                  <option value={l} key={l}>
                    {levelLabels[i]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Urgência">
              <select aria-label="Urgência" {...register('urgency')}>
                {levels.map((l, i) => (
                  <option value={l} key={l}>
                    {levelLabels[i]}
                  </option>
                ))}
              </select>
            </Field>
            {user.role !== 'requester' && (
              <>
                <Field label="Equipe">
                  <select aria-label="Equipe" {...register('teamId')}>
                    <option value="">Sem equipe</option>
                    {meta.data?.teams.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsável">
                  <select aria-label="Responsável" {...register('assigneeId')}>
                    <option value="">Sem responsável</option>
                    {meta.data?.users
                      .filter((u) => u.role !== 'requester' && u.active)
                      .map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
          </div>
          <div className="priority-preview">
            <div>
              <SlidersHorizontal size={18} />
              <span>
                Prioridade calculada <small>Com base no impacto e na urgência</small>
              </span>
            </div>
            {priority ? (
              <PriorityBadge priority={priority} />
            ) : (
              <span className="muted">Carregando matriz…</span>
            )}
          </div>
          {meta.error && (
            <div className="form-alert">
              Não foi possível carregar as categorias. Feche e tente novamente.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={mutation.isPending || !meta.data}
          >
            <Plus size={16} />
            {mutation.isPending ? 'Criando…' : `Criar ${kindLabels[kind].toLowerCase()}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function TicketsPage({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(search);
  const [filters, setFilters] = useState({
    status: params.get('status') ?? '',
    priority: params.get('priority') ?? '',
    category: '',
    teamId: '',
    assigneeId: '',
  });
  const meta = useMeta();
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(1);
    setSearch(params.get('search') ?? '');
    setFilters({
      status: params.get('status') ?? '',
      priority: params.get('priority') ?? '',
      category: '',
      teamId: '',
      assigneeId: '',
    });
    setCreating(params.get('new') === '1');
  }, [kind]);
  const qs = queryString({ kind, page, limit: 10, search: debounced, ...filters });
  const query = useQuery({
    queryKey: ['tickets', kind, qs.toString()],
    queryFn: () => api<TicketList>(`/tickets?${qs}`),
    placeholderData: keepPreviousData,
  });
  const close = useCallback(() => {
    setCreating(false);
    if (params.has('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);
  const updateFilter = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };
  const filtered = Object.values(filters).some(Boolean) || !!search;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">GESTÃO DE SERVIÇOS</div>
          <h1>
            {plural[kind]}
            <span className="heading-dot">.</span>
          </h1>
          <p>{descriptions[kind]}</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={17} />
          {kind === 'request' ? 'Nova solicitação' : `Novo ${kindLabels[kind].toLowerCase()}`}
        </button>
      </div>
      <section className="panel tickets-panel">
        <div className="list-toolbar">
          <div className="list-title">
            <h2>Todos os registros</h2>
            <span className="count-chip">{query.data?.total ?? '—'}</span>
          </div>
          <div className="list-search">
            <Search size={16} />
            <input
              aria-label={`Pesquisar ${plural[kind].toLowerCase()}`}
              placeholder="Buscar por número ou título…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="filters">
          <span className="filter-label">
            <Filter size={15} />
            Filtros
          </span>
          <select
            aria-label="Filtrar por status"
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
          >
            <option value="">Todos os status</option>
            {Object.entries(statusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por prioridade"
            value={filters.priority}
            onChange={(e) => updateFilter('priority', e.target.value)}
          >
            <option value="">Todas as prioridades</option>
            {Object.entries(priorityLabels).map(([v, l]) => (
              <option key={v} value={v}>
                P{v} · {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por categoria"
            value={filters.category}
            onChange={(e) => updateFilter('category', e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {meta.data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por equipe"
            value={filters.teamId}
            onChange={(e) => updateFilter('teamId', e.target.value)}
          >
            <option value="">Todas as equipes</option>
            {meta.data?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por responsável"
            value={filters.assigneeId}
            onChange={(e) => updateFilter('assigneeId', e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {meta.data?.users
              .filter((u) => u.role !== 'requester')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
          {filtered && (
            <button
              className="text-link"
              onClick={() => {
                setSearch('');
                setFilters({ status: '', priority: '', category: '', teamId: '', assigneeId: '' });
                setPage(1);
              }}
            >
              Limpar
            </button>
          )}
        </div>
        {query.isPending ? (
          <Spinner />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          query.data && (
            <>
              <div className={query.isFetching ? 'refreshing' : ''}>
                <TicketTable tickets={query.data.items} />
              </div>
              <Pagination
                page={page}
                total={query.data.total}
                pageSize={query.data.pageSize}
                onPage={setPage}
              />
            </>
          )
        )}
      </section>
      {creating && <CreateTicket kind={kind} onClose={close} />}
    </>
  );
}
function EditTicket({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const meta = useMeta();
  const { notify, user } = useWorkspace();
  const [values, setValues] = useState({
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    subcategory: ticket.subcategory ?? '',
    impact: ticket.impact,
    urgency: ticket.urgency,
    rootCause: ticket.rootCause ?? '',
    workaround: ticket.workaround ?? '',
    resolution: ticket.resolution ?? '',
  });
  const mutation = useMutation({
    mutationFn: () =>
      api(`/tickets/${ticket.id}`, {
        method: 'PATCH',
        body: {
          version: ticket.version,
          title: values.title,
          description: values.description,
          category: values.category,
          subcategory: values.subcategory,
          impact: values.impact,
          urgency: values.urgency,
          ...(user.role !== 'requester' ? { resolution: values.resolution } : {}),
          ...(ticket.kind === 'problem'
            ? { rootCause: values.rootCause, workaround: values.workaround }
            : {}),
        },
      }),
    onSuccess: async () => {
      await invalidate();
      notify('Chamado atualizado.');
      onClose();
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const set = (key: string, value: string) => setValues({ ...values, [key]: value });
  return (
    <Modal title={`Editar ${ticket.number}`} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="modal-body">
          <Field label="Título">
            <input
              aria-label="Título"
              required
              minLength={5}
              maxLength={160}
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <Field label="Descrição">
            <textarea
              aria-label="Descrição"
              required
              minLength={10}
              rows={4}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Categoria">
              <select
                aria-label="Categoria"
                value={values.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {meta.data?.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Subcategoria">
              <input
                aria-label="Subcategoria"
                value={values.subcategory}
                onChange={(e) => set('subcategory', e.target.value)}
              />
            </Field>
            <Field label="Impacto">
              <select
                aria-label="Impacto"
                value={values.impact}
                onChange={(e) => set('impact', e.target.value)}
              >
                {levels.map((l, i) => (
                  <option value={l} key={l}>
                    {levelLabels[i]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Urgência">
              <select
                aria-label="Urgência"
                value={values.urgency}
                onChange={(e) => set('urgency', e.target.value)}
              >
                {levels.map((l, i) => (
                  <option value={l} key={l}>
                    {levelLabels[i]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {ticket.kind === 'problem' && (
            <>
              <Field label="Causa raiz">
                <textarea
                  aria-label="Causa raiz"
                  rows={3}
                  value={values.rootCause}
                  onChange={(e) => set('rootCause', e.target.value)}
                />
              </Field>
              <Field label="Solução de contorno">
                <textarea
                  aria-label="Solução de contorno"
                  rows={3}
                  value={values.workaround}
                  onChange={(e) => set('workaround', e.target.value)}
                />
              </Field>
            </>
          )}
          {user.role !== 'requester' && (
            <Field label="Resolução">
              <textarea
                aria-label="Resolução"
                rows={3}
                value={values.resolution}
                onChange={(e) => set('resolution', e.target.value)}
                placeholder="Registre o resultado e as ações realizadas."
              />
            </Field>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit" disabled={mutation.isPending}>
            <Check size={16} />
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function TicketDetailPage() {
  const { id } = useParams();
  const { user, notify } = useWorkspace();
  const staff = user.role !== 'requester';
  const meta = useMeta();
  const query = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<TicketDetail>(`/tickets/${id}`),
    refetchInterval: 60_000,
  });
  const ticket = query.data?.ticket;
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState('comments');
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [assignment, setAssignment] = useState({ assigneeId: '', teamId: '' });
  const [status, setStatus] = useState<Status>('new');
  const [resolution, setResolution] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [incidentId, setIncidentId] = useState('');
  const [relationOpen, setRelationOpen] = useState(false);
  useEffect(() => {
    setComment('');
    setInternal(false);
    setTab('comments');
    setEdit(false);
    setRelationOpen(false);
    setIncidentId('');
  }, [id]);
  useEffect(() => {
    if (ticket) {
      setAssignment({ assigneeId: ticket.assigneeId ?? '', teamId: ticket.teamId ?? '' });
      setStatus(ticket.status);
      setResolution(ticket.resolution ?? '');
      setRootCause(ticket.rootCause ?? '');
    }
  }, [ticket]);
  const patch = useMutation({
    mutationFn: (body: object) =>
      api(`/tickets/${id}`, { method: 'PATCH', body: { version: ticket?.version, ...body } }),
    onSuccess: async () => {
      await invalidate();
      notify('Chamado atualizado.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const commenting = useMutation({
    mutationFn: () =>
      api(`/tickets/${id}/comments`, {
        method: 'POST',
        body: { body: comment, internal: staff && internal },
      }),
    onSuccess: async () => {
      setComment('');
      await invalidate();
      notify(internal ? 'Nota interna adicionada.' : 'Comentário adicionado.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const incidents = useQuery({
    queryKey: ['relation-incidents'],
    queryFn: () => api<TicketList>('/tickets?kind=incident&limit=100'),
    enabled: relationOpen,
  });
  const relation = useMutation({
    mutationFn: () => api(`/tickets/${id}/relations`, { method: 'POST', body: { incidentId } }),
    onSuccess: async () => {
      await invalidate();
      setRelationOpen(false);
      setIncidentId('');
      notify('Incidente associado ao problema.');
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const closeEdit = useCallback(() => setEdit(false), []);
  const closeRelation = useCallback(() => setRelationOpen(false), []);
  if (query.isPending) return <Skeleton />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (!ticket || !query.data) return null;
  const data = query.data;
  const terminal = ['closed', 'cancelled'].includes(ticket.status);
  return (
    <>
      <Link
        className="back-link"
        to={
          ticket.kind === 'incident'
            ? '/incidents'
            : ticket.kind === 'problem'
              ? '/problems'
              : '/requests'
        }
      >
        <ArrowLeft size={16} />
        Voltar para {plural[ticket.kind].toLowerCase()}
      </Link>
      <div className="detail-heading">
        <div>
          <div className="ticket-heading-meta">
            <span className="ticket-number">{ticket.number}</span>
            <span>{kindLabels[ticket.kind]}</span>
            <StatusBadge status={ticket.status} />
          </div>
          <h1>{ticket.title}</h1>
          <div className="detail-subtitle">
            <span>
              Aberto por <strong>{ticket.requesterName}</strong>
            </span>
            <span>·</span>
            <span>{date(ticket.createdAt)}</span>
          </div>
        </div>
        {(staff || ticket.status === 'new') && !terminal && (
          <button className="button secondary" onClick={() => setEdit(true)}>
            <Pencil size={16} />
            Editar chamado
          </button>
        )}
      </div>
      <div className="detail-grid">
        <div className="detail-primary">
          <section className="panel detail-description">
            <div className="panel-heading">
              <h2>Descrição do chamado</h2>
              <FileText size={18} className="muted" />
            </div>
            <p className="preserve-text">{ticket.description}</p>
            <div className="description-tags">
              <span>{ticket.category}</span>
              {ticket.subcategory && <span>{ticket.subcategory}</span>}
              {ticket.requestType && <span>{ticket.requestType}</span>}
            </div>
          </section>
          {ticket.kind === 'problem' && (
            <section className="panel investigation-panel">
              <div className="panel-heading">
                <h2>Investigação e resolução</h2>
                <LayersIcon />
              </div>
              {[
                ['Causa raiz', ticket.rootCause],
                ['Solução de contorno', ticket.workaround],
                ['Resolução definitiva', ticket.resolution],
              ].map(([label, value]) => (
                <div className="investigation-field" key={label}>
                  <h3>{label}</h3>
                  <p className="preserve-text">{value || 'Ainda não documentada.'}</p>
                </div>
              ))}
            </section>
          )}
          {ticket.kind !== 'problem' && ticket.resolution && (
            <section className="panel resolution-panel">
              <div className="panel-heading">
                <h2>
                  <Check size={18} />
                  Resolução
                </h2>
              </div>
              <p className="preserve-text">{ticket.resolution}</p>
            </section>
          )}
          <section className="panel activity-panel">
            <div className="tabs">
              <button
                className={tab === 'comments' ? 'active' : ''}
                onClick={() => setTab('comments')}
              >
                <MessageSquare size={16} />
                Comentários<span>{data.comments.length}</span>
              </button>
              <button
                className={tab === 'history' ? 'active' : ''}
                onClick={() => setTab('history')}
              >
                <HistoryIcon size={16} />
                Histórico<span>{data.history.length}</span>
              </button>
            </div>
            {tab === 'comments' ? (
              <>
                <div className="comments-list">
                  {data.comments.length ? (
                    data.comments.map((c) => (
                      <article className="comment" key={c.id}>
                        <Avatar name={c.authorName} />
                        <div>
                          <div className="comment-heading">
                            <strong>{c.authorName}</strong>
                            {c.internal && (
                              <span className="badge internal">
                                <ShieldCheck size={11} />
                                Nota interna
                              </span>
                            )}
                            <time>{date(c.createdAt)}</time>
                          </div>
                          <p className="preserve-text">{c.body}</p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <Empty
                      title="A conversa começa aqui"
                      description="Compartilhe informações e mantenha todos atualizados."
                    />
                  )}
                </div>
                {!terminal && (
                  <form
                    className="comment-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      commenting.mutate();
                    }}
                  >
                    <Field label="Comentário">
                      <textarea
                        aria-label="Comentário"
                        placeholder="Escreva uma atualização para este chamado…"
                        value={comment}
                        required
                        maxLength={10000}
                        rows={3}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </Field>
                    <div className="comment-footer">
                      {staff ? (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={internal}
                            onChange={(e) => setInternal(e.target.checked)}
                          />
                          <ShieldCheck size={14} />
                          Nota interna · apenas equipe
                        </label>
                      ) : (
                        <span className="muted">Visível para a equipe de atendimento</span>
                      )}
                      <button
                        className="button primary"
                        type="submit"
                        disabled={commenting.isPending || !comment.trim()}
                      >
                        <Send size={15} />
                        {commenting.isPending ? 'Enviando…' : 'Adicionar comentário'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <div className="history-list">
                {data.history.length ? (
                  data.history.map((h) => (
                    <article className="history-item" key={h.id}>
                      <span className="history-mark">
                        <HistoryIcon size={14} />
                      </span>
                      <div>
                        <strong>{h.description}</strong>
                        <p>
                          {h.actorName} <span>·</span> {date(h.createdAt)}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty title="Sem histórico" />
                )}
              </div>
            )}
          </section>
          {(ticket.kind === 'problem' || data.relatedProblem) && (
            <section className="panel relations-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {ticket.kind === 'problem' ? 'Incidentes relacionados' : 'Problema associado'}
                  </h2>
                  <p>Conecte recorrências e acompanhe a causa</p>
                </div>
                {staff && !terminal && ticket.kind === 'problem' && (
                  <button className="button secondary small" onClick={() => setRelationOpen(true)}>
                    <Link2 size={15} />
                    Associar incidente
                  </button>
                )}
              </div>
              {ticket.kind === 'problem' ? (
                data.relatedIncidents.length ? (
                  data.relatedIncidents.map((t) => (
                    <Link key={t.id} className="related-ticket" to={`/tickets/${t.id}`}>
                      <span className="ticket-number">{t.number}</span>
                      <strong>{t.title}</strong>
                      <StatusBadge status={t.status} />
                      <ArrowRight size={16} />
                    </Link>
                  ))
                ) : (
                  <Empty
                    title="Nenhum incidente associado"
                    description="Associe os incidentes originados por este problema."
                  />
                )
              ) : (
                data.relatedProblem && (
                  <Link className="related-ticket" to={`/tickets/${data.relatedProblem.id}`}>
                    <span className="ticket-number">{data.relatedProblem.number}</span>
                    <strong>{data.relatedProblem.title}</strong>
                    <ArrowRight size={16} />
                  </Link>
                )
              )}
            </section>
          )}
        </div>
        <aside className="detail-aside">
          <section className="panel attributes-panel">
            <div className="panel-heading">
              <h2>Informações do chamado</h2>
              <SlidersHorizontal size={17} className="muted" />
            </div>
            <div className="attribute-row">
              <span>Prioridade</span>
              <PriorityBadge priority={ticket.priority} />
            </div>
            <div className="attribute-row">
              <span>Impacto</span>
              <strong>{levelLabels[levels.indexOf(ticket.impact)]}</strong>
            </div>
            <div className="attribute-row">
              <span>Urgência</span>
              <strong>{levelLabels[levels.indexOf(ticket.urgency)]}</strong>
            </div>
            <div className="attribute-row">
              <span>Solicitante</span>
              <strong>{ticket.requesterName}</strong>
            </div>
            <div className="attribute-row">
              <span>Atualizado</span>
              <strong>{date(ticket.updatedAt)}</strong>
            </div>
            {ticket.resolvedAt && (
              <div className="attribute-row">
                <span>Resolvido</span>
                <strong>{date(ticket.resolvedAt)}</strong>
              </div>
            )}
          </section>
          <section className="panel sla-detail">
            <div className="panel-heading">
              <h2>
                <Clock3 size={17} />
                Prazos de SLA
              </h2>
              <span className="count-chip">24×7</span>
            </div>
            {[
              ['Primeira resposta', ticket.responseSlaState, ticket.responseDueAt],
              ['Resolução', ticket.resolutionSlaState, ticket.resolutionDueAt],
            ].map(([label, state, due]) => (
              <div className="sla-detail-row" key={label}>
                <span>{label}</span>
                <SlaBadge state={state} />
                <strong>{date(due)}</strong>
                {['on_track', 'at_risk', 'breached'].includes(state) && (
                  <small>{remaining(due)}</small>
                )}
              </div>
            ))}
            <p className="sla-note">
              Contagem contínua, inclusive em espera. Horários em {timezoneLabel}.
            </p>
          </section>
          <section className="panel assignment-panel">
            <div className="panel-heading">
              <h2>
                <UserRound size={17} />
                Atendimento
              </h2>
            </div>
            {staff && !terminal ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  patch.mutate({
                    assigneeId: assignment.assigneeId || null,
                    teamId: assignment.teamId || null,
                  });
                }}
              >
                <Field label="Equipe">
                  <select
                    aria-label="Equipe de atendimento"
                    value={assignment.teamId}
                    onChange={(e) => setAssignment({ ...assignment, teamId: e.target.value })}
                  >
                    <option value="">Sem equipe</option>
                    {meta.data?.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsável">
                  <select
                    aria-label="Responsável"
                    value={assignment.assigneeId}
                    onChange={(e) => setAssignment({ ...assignment, assigneeId: e.target.value })}
                  >
                    <option value="">Sem responsável</option>
                    {meta.data?.users
                      .filter((u) => u.role !== 'requester' && u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="assignment-actions">
                  <button
                    className="button secondary small"
                    type="button"
                    disabled={patch.isPending || ticket.assigneeId === user.id}
                    onClick={() => patch.mutate({ assigneeId: user.id })}
                  >
                    Assumir chamado
                  </button>
                  <button
                    className="button primary small"
                    type="submit"
                    disabled={
                      patch.isPending ||
                      (assignment.assigneeId === (ticket.assigneeId ?? '') &&
                        assignment.teamId === (ticket.teamId ?? ''))
                    }
                  >
                    Salvar atribuição
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="attribute-row">
                  <span>Equipe</span>
                  <strong>{ticket.teamName ?? 'Sem equipe'}</strong>
                </div>
                <div className="attribute-row">
                  <span>Responsável</span>
                  <strong>{ticket.assigneeName ?? 'Aguardando atribuição'}</strong>
                </div>
              </>
            )}
          </section>
          {staff && transitions[ticket.status].length > 0 && (
            <section className="panel status-control">
              <div className="panel-heading">
                <h2>Próxima etapa</h2>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  patch.mutate({
                    status,
                    ...(status === 'resolved'
                      ? { resolution, ...(ticket.kind === 'problem' ? { rootCause } : {}) }
                      : {}),
                  });
                }}
              >
                <Field label="Status">
                  <select
                    aria-label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                  >
                    <option value={ticket.status}>{statusLabels[ticket.status]}</option>
                    {transitions[ticket.status].map((s) => (
                      <option key={s} value={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                {status === 'resolved' && ticket.status !== 'resolved' && (
                  <Field label="Resolução">
                    <textarea
                      aria-label="Resolução do chamado"
                      rows={3}
                      minLength={5}
                      required
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Descreva a solução aplicada."
                    />
                  </Field>
                )}
                {status === 'resolved' &&
                  ticket.status !== 'resolved' &&
                  ticket.kind === 'problem' && (
                    <Field label="Causa raiz">
                      <textarea
                        aria-label="Causa raiz do problema"
                        required
                        minLength={5}
                        rows={3}
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                        placeholder="Documente a origem do problema."
                      />
                    </Field>
                  )}
                <button
                  className="button primary full-width"
                  disabled={patch.isPending || status === ticket.status}
                  type="submit"
                >
                  <Check size={16} />
                  {patch.isPending ? 'Atualizando…' : 'Atualizar status'}
                </button>
              </form>
            </section>
          )}
        </aside>
      </div>
      {edit && <EditTicket ticket={ticket} onClose={closeEdit} />}{' '}
      {relationOpen && (
        <Modal title="Associar incidente" onClose={closeRelation}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              relation.mutate();
            }}
          >
            <div className="modal-body">
              <Field label="Incidente">
                <select
                  aria-label="Incidente relacionado"
                  required
                  value={incidentId}
                  onChange={(e) => setIncidentId(e.target.value)}
                >
                  <option value="">Selecione um incidente</option>
                  {incidents.data?.items
                    .filter((t) => !data.relatedIncidents.some((r) => r.id === t.id))
                    .map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.number} · {t.title}
                      </option>
                    ))}
                </select>
              </Field>
              {incidents.isPending && <Spinner label="Carregando incidentes" />}
              {incidents.error && <ErrorState error={incidents.error} />}
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={closeRelation}>
                Cancelar
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={!incidentId || relation.isPending}
              >
                <Link2 size={16} />
                Associar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function LayersIcon() {
  return <Link2 size={18} className="muted" />;
}
