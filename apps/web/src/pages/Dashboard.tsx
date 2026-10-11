import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  CircleAlert,
  Clock3,
  Layers3,
  Plus,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api';
import { useWorkspace } from '../context';
import type { Dashboard, Status } from '../types';
import {
  date,
  displayTimezone,
  Empty,
  ErrorState,
  Skeleton,
  TicketTable,
  statusLabels,
  slaLabels,
} from '../ui';
const chartColors = ['#9b86f9', '#6383f7', '#4ec8b2', '#eda55a'];
const tooltipStyle = {
  background: '#19202d',
  border: '1px solid #343d4f',
  borderRadius: 10,
  color: '#edf0f6',
  fontSize: 12,
};
export default function DashboardPage() {
  const { user } = useWorkspace();
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => api<Dashboard>(`/dashboard?days=${days}`),
    refetchInterval: 60_000,
  });
  const data = query.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">
            <span className="local-dot" />
            CENTRO DE OPERAÇÕES
          </div>
          <h1>
            Visão geral<span className="heading-dot">.</span>
          </h1>
          <p>Olá, {user.name.split(' ')[0]}. Aqui está o panorama da sua operação.</p>
        </div>
        <div className="heading-actions">
          <select
            className="period-select"
            aria-label="Período do dashboard"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <Link className="button primary" to="/incidents?new=1">
            <Plus size={17} />
            Novo incidente
          </Link>
        </div>
      </div>
      {query.isPending ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <div className="overview-strip">
              <span className="overview-message">
                <Activity size={17} />
                <strong>Operação em foco</strong>
                <span>Indicadores do período selecionado</span>
              </span>
              <span className="last-sync">
                <span className="local-dot" />
                Atualizado às{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: displayTimezone,
                }).format(new Date(query.dataUpdatedAt))}
              </span>
            </div>
            <div className="metric-grid">
              <Metric
                label="Incidentes abertos"
                value={data.metrics.openIncidents}
                icon={Activity}
                color="blue"
                note={`${data.metrics.totalIncidents} incidentes no período`}
                link="/incidents"
              />
              <Metric
                label="Incidentes críticos"
                value={data.metrics.criticalIncidents}
                icon={CircleAlert}
                color="orange"
                note="Prioridade P1 · atenção imediata"
                link="/incidents?priority=1"
              />
              <Metric
                label="SLAs vencidos"
                value={data.metrics.breachedSlas}
                icon={Timer}
                color="red"
                note="Resposta e resolução"
                link={user.role === 'requester' ? '/incidents' : '/slas'}
              />
              <Metric
                label="Cumprimento de SLA"
                value={`${Number(data.metrics.slaCompliance).toFixed(1)}%`}
                icon={ShieldCheck}
                color="green"
                note="Metas concluídas no prazo"
                link={user.role === 'requester' ? '/incidents' : '/slas'}
              />
            </div>
            <div className="dashboard-main-grid">
              <section className="panel trend-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Evolução dos incidentes</h2>
                    <p>Aberturas e resoluções ao longo do tempo</p>
                  </div>
                  <div className="chart-legends">
                    <span>
                      <i style={{ background: '#9b86f9' }} />
                      Abertos
                    </span>
                    <span>
                      <i style={{ background: '#4ec8b2' }} />
                      Resolvidos
                    </span>
                  </div>
                </div>
                {data.trend.length && data.trend.some((t) => t.created || t.resolved) ? (
                  <div className="chart-area">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.trend}
                        margin={{ top: 12, right: 6, bottom: 0, left: -22 }}
                      >
                        <defs>
                          <linearGradient id="created-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#9b86f9" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#9b86f9" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="resolved-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4ec8b2" stopOpacity={0.09} />
                            <stop offset="95%" stopColor="#4ec8b2" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#28303e" strokeDasharray="3 4" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => date(v, true)}
                          minTickGap={40}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#8b96ab', fontSize: 11 }}
                          dy={10}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#8b96ab', fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          labelFormatter={(v) => date(String(v), true)}
                        />
                        <Area
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="created"
                          name="Abertos"
                          stroke="#9b86f9"
                          strokeWidth={2.5}
                          fill="url(#created-fill)"
                        />
                        <Area
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="resolved"
                          name="Resolvidos"
                          stroke="#4ec8b2"
                          strokeWidth={2.5}
                          fill="url(#resolved-fill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty
                    title="Sem atividade neste período"
                    description="As aberturas e resoluções aparecerão aqui."
                  />
                )}
                <div className="chart-summary">
                  <span>
                    <strong>{data.metrics.totalIncidents}</strong> incidentes registrados
                  </span>
                  <span>
                    <CheckCheck size={16} />
                    <strong>{data.metrics.resolvedIncidents}</strong> resolvidos
                  </span>
                </div>
              </section>
              <section className="panel priority-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Distribuição por prioridade</h2>
                    <p>Uma visão do impacto na operação</p>
                  </div>
                </div>
                {data.priorities.some((p) => p.value > 0) ? (
                  <>
                    <div className="donut-wrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            isAnimationActive={false}
                            data={data.priorities}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={65}
                            outerRadius={85}
                            paddingAngle={5}
                            stroke="none"
                            startAngle={90}
                            endAngle={-270}
                          >
                            {data.priorities.map((p, i) => (
                              <Cell key={p.name} fill={chartColors[i % 4]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="donut-center">
                        <strong>{data.priorities.reduce((a, p) => a + p.value, 0)}</strong>
                        <span>incidentes</span>
                      </div>
                    </div>
                    <div className="priority-legend">
                      {data.priorities.map((p, i) => (
                        <div key={p.name}>
                          <span>
                            <i style={{ background: chartColors[i % 4] }} />
                            {p.name}
                          </span>
                          <strong>{p.value}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Empty
                    title="Nenhum incidente"
                    description="Abra um incidente para visualizar a distribuição."
                  />
                )}
              </section>
            </div>
            <div className="dashboard-secondary-grid">
              <section className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Status da operação</h2>
                    <p>Distribuição dos incidentes</p>
                  </div>
                  <Activity size={18} className="muted" />
                </div>
                <div className="status-bars">
                  {data.statuses.length ? (
                    data.statuses.map((s, i) => (
                      <div key={s.name}>
                        <div>
                          <span>{statusLabels[s.name as Status] ?? s.name}</span>
                          <strong>{s.value}</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${data.statuses.reduce((a, v) => a + v.value, 0) ? (s.value / data.statuses.reduce((a, v) => a + v.value, 0)) * 100 : 0}%`,
                              background: chartColors[i % 4],
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Nenhum incidente no período.</p>
                  )}
                </div>
              </section>
              <section className="panel service-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Além dos incidentes</h2>
                    <p>Conecte as frentes da sua operação</p>
                  </div>
                  <Layers3 size={18} className="muted" />
                </div>
                <Link
                  to={user.role === 'requester' ? '/requests' : '/problems'}
                  className="service-row"
                >
                  <span className="service-icon violet">
                    <Layers3 size={19} />
                  </span>
                  <div>
                    <strong>Problemas ativos</strong>
                    <span>Investigação de causas e recorrências</span>
                  </div>
                  <b>{data.metrics.activeProblems}</b>
                  <ArrowRight size={16} />
                </Link>
                <Link to="/requests" className="service-row">
                  <span className="service-icon blue">
                    <Clock3 size={19} />
                  </span>
                  <div>
                    <strong>Solicitações pendentes</strong>
                    <span>Serviços aguardando atendimento</span>
                  </div>
                  <b>{data.metrics.pendingRequests}</b>
                  <ArrowRight size={16} />
                </Link>
                <div className="sla-mini">
                  <ShieldCheck size={16} />
                  <span>{data.metrics.resolvedIncidents} incidentes resolvidos no período</span>
                </div>
              </section>
              <section className="panel sla-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Resultados de SLA</h2>
                    <p>Resposta e resolução</p>
                  </div>
                  <ShieldCheck size={18} className="muted" />
                </div>
                <div className="sla-results">
                  {data.sla.length ? (
                    data.sla.map((s) => (
                      <div key={s.name}>
                        <span>{slaLabels[s.name] ?? s.name}</span>
                        <strong>{s.value}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Nenhuma meta avaliada.</p>
                  )}
                </div>
                <Link className="text-link" to={user.role === 'requester' ? '/incidents' : '/slas'}>
                  Acompanhar os prazos
                  <ArrowRight size={15} />
                </Link>
              </section>
            </div>
            <section className="panel recent-panel">
              <div className="panel-heading">
                <div>
                  <h2>Chamados recentes</h2>
                  <p>As últimas movimentações da operação</p>
                </div>
                <Link className="text-link" to="/incidents">
                  Ver incidentes
                  <ArrowRight size={15} />
                </Link>
              </div>
              <TicketTable tickets={data.recentTickets} compact />
            </section>
          </>
        )
      )}
    </>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
  color,
  note,
  link,
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
  color: string;
  note: string;
  link: string;
}) {
  return (
    <Link className={`metric-card ${color}`} to={link}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={19} />
        </span>
      </div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-note">
        <span>{note}</span>
        <ArrowUpRight size={15} />
      </div>
    </Link>
  );
}
