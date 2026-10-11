import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  X,
  Inbox,
  Clock3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Ticket, Status } from './types';
export const statusLabels: Record<Status, string> = {
  new: 'Novo',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
};
export const kindLabels = { incident: 'Incidente', problem: 'Problema', request: 'Solicitação' };
export const priorityLabels: Record<number, string> = {
  1: 'Crítica',
  2: 'Alta',
  3: 'Moderada',
  4: 'Baixa',
};
export const roleLabels = {
  administrator: 'Administrador',
  agent: 'Agente de suporte',
  requester: 'Solicitante',
};
export const slaLabels: Record<string, string> = {
  on_track: 'Dentro do prazo',
  at_risk: 'Próximo do vencimento',
  breached: 'Vencido',
  met: 'Concluído no prazo',
  missed: 'Concluído fora do prazo',
};
export const displayTimezone = import.meta.env.VITE_TIMEZONE || 'America/Sao_Paulo';
export const timezoneLabel = displayTimezone === 'America/Sao_Paulo' ? 'Brasília' : displayTimezone;
export function date(value: string | null | undefined, compact = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        ...(compact ? {} : { hour: '2-digit', minute: '2-digit' }),
        timeZone: displayTimezone,
      }).format(parsed);
}
export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0])
    .join('')
    .toUpperCase();
}
export function remaining(value: string) {
  const mins = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (mins < 0)
    return `${Math.abs(mins) < 60 ? `${Math.abs(mins)} min` : `${Math.round(Math.abs(mins) / 60)} h`} em atraso`;
  return mins < 60 ? `${mins} min restantes` : `${Math.round(mins / 60)} h restantes`;
}
export function Spinner({ label = 'Carregando dados' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}…</span>
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton-layout" aria-label="Carregando" role="status">
      <div className="skeleton title" />
      <div className="skeleton-grid">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="skeleton metric" />
        ))}
      </div>
      <div className="skeleton chart" />
    </div>
  );
}
export function Empty({
  title = 'Nenhum registro por aqui',
  description = 'Os registros que você criar aparecerão neste espaço.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>Não foi possível carregar os dados</strong>
        <p>{error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente.'}</p>
      </div>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          'aria-describedby'?: string;
          'aria-invalid'?: boolean;
        }>,
        {
          id,
          'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
          'aria-invalid': !!error,
        },
      )
    : children;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div>{control}</div>
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
      {hint && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge status-${status}`}>
      <span className="status-dot" />
      {statusLabels[status]}
    </span>
  );
}
export function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span className={`priority priority-${priority}`}>
      <span className="priority-bars">
        <i />
        <i />
        <i />
      </span>
      P{priority} <span className="priority-word">{priorityLabels[priority]}</span>
    </span>
  );
}
export function SlaBadge({ state }: { state: string }) {
  return (
    <span className={`badge sla-${state}`}>
      <Clock3 size={12} />
      {slaLabels[state] ?? state}
    </span>
  );
}
export function Avatar({ name, size = 'normal' }: { name: string; size?: string }) {
  return <span className={`avatar ${size}`}>{initials(name)}</span>;
}
export function TicketTable({
  tickets,
  compact = false,
}: {
  tickets: Ticket[];
  compact?: boolean;
}) {
  if (!tickets.length)
    return <Empty description="Nenhum chamado corresponde aos filtros selecionados." />;
  return (
    <div className="table-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>Chamado</th>
            <th>Prioridade</th>
            <th>Status</th>
            {!compact && <th>Responsável</th>}
            <th>SLA de resolução</th>
            <th className="table-date">Atualização</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <Link className="ticket-cell" to={`/tickets/${ticket.id}`}>
                  <span className="ticket-number">{ticket.number}</span>
                  <strong>{ticket.title}</strong>
                  <span className="ticket-category">{ticket.category}</span>
                </Link>
              </td>
              <td>
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td>
                <StatusBadge status={ticket.status} />
              </td>
              {!compact && (
                <td>
                  {ticket.assigneeName ? (
                    <span className="person">
                      <Avatar name={ticket.assigneeName} size="small" />
                      <span>{ticket.assigneeName}</span>
                    </span>
                  ) : (
                    <span className="muted">Sem responsável</span>
                  )}
                </td>
              )}
              <td>
                <SlaBadge state={ticket.resolutionSlaState} />
              </td>
              <td className="muted table-date">{date(ticket.updatedAt, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total === 0
          ? 'Nenhum registro'
          : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total} registros`}
      </span>
      <div>
        <button
          aria-label="Página anterior"
          className="icon-button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          aria-label="Próxima página"
          className="icon-button"
          disabled={page * pageSize >= total}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    const elements = () =>
      el?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input,select,textarea,a[href],[tabindex="0"]',
      );
    elements()?.[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const all = elements();
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">NEXUSOPS · OPERAÇÃO</span>
            <h2 id={id}>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Fechar diálogo" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Toast({
  message,
  type,
  close,
}: {
  message: string;
  type: 'success' | 'error';
  close: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(close, 6000);
    return () => clearTimeout(t);
  }, [close]);
  return (
    <div className={`toast ${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
      <span>{message}</span>
      <button aria-label="Dispensar aviso" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
