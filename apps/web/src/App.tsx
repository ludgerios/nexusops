import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bell,
  Blocks,
  ChevronDown,
  Command,
  FileBarChart2,
  Gauge,
  Layers3,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, queryClient, setCsrf } from './api';
import { Workspace } from './context';
import type { User, Notification, TicketList } from './types';
import { Avatar, Field, roleLabels, Spinner, Toast } from './ui';
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const TicketsPage = lazy(() =>
  import('./pages/Tickets').then((module) => ({ default: module.TicketsPage })),
);
const TicketDetailPage = lazy(() =>
  import('./pages/Tickets').then((module) => ({ default: module.TicketDetailPage })),
);
const AdminPage = lazy(() =>
  import('./pages/Operations').then((module) => ({ default: module.AdminPage })),
);
const AutomationsPage = lazy(() =>
  import('./pages/Operations').then((module) => ({ default: module.AutomationsPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/Operations').then((module) => ({ default: module.NotificationsPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/Operations').then((module) => ({ default: module.ReportsPage })),
);
const SlasPage = lazy(() =>
  import('./pages/Operations').then((module) => ({ default: module.SlasPage })),
);

const navItems = [
  { path: '/', label: 'Visão geral', icon: Gauge, section: 'workspace' },
  { path: '/incidents', label: 'Incidentes', icon: Activity, section: 'workspace' },
  { path: '/problems', label: 'Problemas', icon: Layers3, section: 'workspace', staff: true },
  { path: '/requests', label: 'Solicitações', icon: Blocks, section: 'workspace' },
  { path: '/slas', label: 'SLAs', icon: Timer, section: 'operation', staff: true },
  { path: '/automations', label: 'Automações', icon: Zap, section: 'operation', staff: true },
  { path: '/notifications', label: 'Notificações', icon: Bell, section: 'operation' },
  { path: '/reports', label: 'Relatórios', icon: FileBarChart2, section: 'operation', staff: true },
  { path: '/admin', label: 'Administração', icon: Settings2, section: 'admin', admin: true },
];
const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});
type LoginValues = z.infer<typeof loginSchema>;
function Login({ onLogin }: { onLogin: (data: { user: User; csrfToken: string }) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const mutation = useMutation({
    mutationFn: (body: LoginValues) =>
      api<{ user: User; csrfToken: string }>('/auth/login', { method: 'POST', body }),
    onSuccess: onLogin,
  });
  return (
    <main className="login-page">
      <section className="login-story">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <Activity size={25} />
          </span>
          <span>
            Nexus<span>Ops</span>
          </span>
        </Link>
        <div className="login-story-copy">
          <span className="eyebrow">CONECTE SUA OPERAÇÃO</span>
          <h1>
            Clareza para agir.
            <br />
            <span>Controle para evoluir.</span>
          </h1>
          <p>
            Incidentes, serviços e equipes em um único lugar. Uma visão completa do que faz sua
            operação acontecer.
          </p>
          <div className="orbit-visual" aria-hidden="true">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="orbit-center">
              <Activity size={42} />
            </div>
            <span className="orbit-point point-a">
              <ShieldCheck size={25} />
            </span>
            <span className="orbit-point point-b">
              <Zap size={25} />
            </span>
            <span className="orbit-point point-c">
              <Timer size={25} />
            </span>
            <div className="orbit-tag">
              <span className="status-dot" />
              Tudo conectado. Tudo sob controle.
            </div>
          </div>
        </div>
        <footer>
          PROJETO AUTORAL · BRENO LUDGERIO <span>IT Service Management</span>
        </footer>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <span className="welcome-icon">
            <Command size={25} />
          </span>
          <span className="eyebrow">SEU CENTRO DE OPERAÇÕES</span>
          <h2>Bom ter você por aqui.</h2>
          <p className="muted">Entre na sua conta para continuar.</p>
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
            <Field label="E-mail" error={errors.email?.message}>
              <input
                aria-label="E-mail"
                type="email"
                autoComplete="username"
                placeholder="voce@exemplo.com"
                {...register('email')}
              />
            </Field>
            <Field label="Senha" error={errors.password?.message}>
              <input
                aria-label="Senha"
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                {...register('password')}
              />
            </Field>
            {mutation.error && (
              <div className="form-alert" role="alert">
                {mutation.error.message}
              </div>
            )}
            <button
              className="button primary login-submit"
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Entrando…' : 'Entrar'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-hint">
            <ShieldCheck size={18} />
            <p>
              Ambiente local de demonstração.
              <br />
              Consulte <code>.demo-credentials</code> após executar <code>npm run setup</code>.
            </p>
          </div>
          <p className="login-copyright">NexusOps © {new Date().getFullYear()} · Breno Ludgerio</p>
        </div>
      </section>
    </main>
  );
}
function GlobalSearch() {
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setSearch(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);
  const results = useQuery({
    queryKey: ['global-search', search],
    queryFn: () => api<TicketList>(`/tickets?search=${encodeURIComponent(search)}&limit=5`),
    enabled: search.length >= 2,
  });
  const go = (id: string) => {
    setOpen(false);
    setValue('');
    navigate(`/tickets/${id}`);
  };
  return (
    <div className="global-search">
      <Search size={17} />
      <input
        aria-label="Busca global"
        placeholder="Buscar chamados…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && results.data?.items[0]) go(results.data.items[0].id);
        }}
      />
      <span className="search-shortcut">Busca</span>
      {open && search.length >= 2 && (
        <>
          <button
            className="search-dismiss"
            aria-label="Fechar resultados da busca"
            onClick={() => setOpen(false)}
          />
          <div className="search-results">
            {results.isPending ? (
              <p>Buscando…</p>
            ) : results.error ? (
              <p role="alert">{results.error.message}</p>
            ) : results.data?.items.length ? (
              results.data.items.map((t) => (
                <button key={t.id} onClick={() => go(t.id)}>
                  <span>{t.number}</span>
                  <strong>{t.title}</strong>
                  <ArrowRight size={16} />
                </button>
              ))
            ) : (
              <p>Nenhum chamado encontrado.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
export default function App() {
  const [session, setSession] = useState<{ user: User; csrfToken: string } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [account, setAccount] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const location = useLocation();
  const auth = useQuery({
    queryKey: ['session'],
    queryFn: () => api<{ user: User; csrfToken: string }>('/auth/me'),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const notify = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type }),
    [],
  );
  const closeToast = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (auth.data) {
      setCsrf(auth.data.csrfToken);
      setSession(auth.data);
    }
  }, [auth.data]);
  useEffect(() => {
    const expired = () => {
      setSession(null);
      setCsrf('');
      queryClient.clear();
      notify('Sua sessão expirou. Entre novamente.', 'error');
    };
    window.addEventListener('nexusops:session-expired', expired);
    return () => window.removeEventListener('nexusops:session-expired', expired);
  }, [notify]);
  useEffect(() => {
    setMobile(false);
    setAccount(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: Notification[]; unread: number }>('/notifications'),
    enabled: !!session,
    refetchInterval: 30_000,
  });
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      setSession(null);
      setCsrf('');
      queryClient.clear();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  if (auth.isPending && !session)
    return (
      <main className="startup">
        <span className="brand-icon">
          <Activity size={30} />
        </span>
        <Spinner label="Conectando à operação" />
      </main>
    );
  if (!session)
    return (
      <>
        <Login
          onLogin={(data) => {
            setCsrf(data.csrfToken);
            setSession(data);
            queryClient.setQueryData(['session'], data);
          }}
        />
        {toast && <Toast {...toast} close={closeToast} />}
      </>
    );
  const user = session.user;
  const current = navItems.find((n) => n.path === location.pathname);
  const title =
    current?.label ?? (location.pathname.startsWith('/tickets/') ? 'Detalhes do chamado' : 'Conta');
  const staff = user.role !== 'requester';
  const visible = navItems.filter(
    (n) => (!n.staff || staff) && (!n.admin || user.role === 'administrator'),
  );
  return (
    <Workspace.Provider value={{ user, notify, logout }}>
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <div className="app-shell">
        {mobile && (
          <button
            className="sidebar-shade"
            aria-label="Fechar navegação"
            onClick={() => setMobile(false)}
          />
        )}
        <aside
          id="main-navigation"
          className={`sidebar ${mobile ? 'open' : ''}`}
          aria-label="Navegação principal"
        >
          <Link className="brand" to="/">
            <span className="brand-icon">
              <Activity size={22} />
            </span>
            <span>
              Nexus<span>Ops</span>
            </span>
            <span className="brand-dot" />
          </Link>
          <button
            className="mobile-close icon-button"
            onClick={() => setMobile(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
          <div className="workspace-switch">
            <span className="workspace-logo">N</span>
            <div>
              <strong>Workspace local</strong>
              <span>Operação de TI</span>
            </div>
            <span className="local-dot" />
          </div>
          <nav>
            {['workspace', 'operation', 'admin'].map((section) => (
              <div className="nav-section" key={section}>
                {visible.some((n) => n.section === section) && (
                  <span className="nav-label">
                    {section === 'workspace'
                      ? 'WORKSPACE'
                      : section === 'operation'
                        ? 'OPERAÇÃO'
                        : 'GERENCIAMENTO'}
                  </span>
                )}
                {visible
                  .filter((n) => n.section === section)
                  .map(({ path, label, icon: Icon }) => (
                    <NavLink
                      end={path === '/'}
                      key={path}
                      to={path}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={19} />
                      <span>{label}</span>
                      {path === '/notifications' && !!notifications.data?.unread && (
                        <span className="nav-count">{notifications.data.unread}</span>
                      )}
                    </NavLink>
                  ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="workspace-status">
              <span className="local-dot" />
              <span>Ambiente demonstrativo</span>
              <ShieldCheck size={15} />
            </div>
            <button
              className="sidebar-user"
              onClick={() => {
                setMobile(false);
                setAccount(!account);
              }}
              aria-expanded={account}
            >
              <Avatar name={user.name} />
              <span>
                <strong>{user.name}</strong>
                <small>{roleLabels[user.role]}</small>
              </span>
              <ChevronDown size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Abrir menu"
                aria-expanded={mobile}
                aria-controls="main-navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={22} />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span> <strong>{title}</strong>
              </span>
            </div>
            <div className="topbar-actions">
              <GlobalSearch />
              <Link
                className="icon-button notification-button"
                to="/notifications"
                aria-label={`Notificações${notifications.data?.unread ? `, ${notifications.data.unread} não lidas` : ''}`}
              >
                <Bell size={20} />
                {!!notifications.data?.unread && <span />}
              </Link>
              <div className="topbar-divider" />
              <button
                className="account-trigger"
                onClick={() => setAccount(!account)}
                aria-label="Menu da conta"
                aria-expanded={account}
              >
                <Avatar name={user.name} size="small" />
                <ChevronDown size={14} />
              </button>
            </div>
            {account && (
              <div className="account-menu">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                <span className="role-note">
                  <ShieldCheck size={14} />
                  {roleLabels[user.role]}
                </span>
                <button onClick={() => void logout()}>
                  <LogOut size={16} />
                  Sair da conta
                </button>
              </div>
            )}
          </header>
          <main id="main-content" className="page-content" tabIndex={-1}>
            <Suspense fallback={<Spinner label="Carregando página" />}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/incidents" element={<TicketsPage kind="incident" />} />
                <Route path="/requests" element={<TicketsPage kind="request" />} />
                <Route
                  path="/problems"
                  element={staff ? <TicketsPage kind="problem" /> : <Navigate to="/" replace />}
                />
                <Route path="/tickets/:id" element={<TicketDetailPage />} />
                <Route path="/slas" element={staff ? <SlasPage /> : <Navigate to="/" replace />} />
                <Route
                  path="/automations"
                  element={staff ? <AutomationsPage /> : <Navigate to="/" replace />}
                />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route
                  path="/reports"
                  element={staff ? <ReportsPage /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/admin"
                  element={
                    user.role === 'administrator' ? <AdminPage /> : <Navigate to="/" replace />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          <footer className="app-footer">
            <span>
              NexusOps <span>·</span> Clareza para sua operação.
            </span>
            <span>© {new Date().getFullYear()} Breno Ludgerio</span>
          </footer>
        </div>
      </div>
      {toast && <Toast {...toast} close={closeToast} />}
    </Workspace.Provider>
  );
}
