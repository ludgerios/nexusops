import { expect, test } from '@playwright/test';
import type { Ticket, TicketDetail } from '@nexusops/shared';
import { credentials, login } from './helpers';

test('login inválido, cookie protegido, sessão e logout', async ({ page }) => {
  await page.goto('/incidents');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('inexistente@nexusops.local');
  await page.getByLabel('Senha', { exact: true }).fill('senha-incorreta-e2e');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();

  await login(page);
  const session = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'nexusops_session',
  );
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Visão geral.' })).toBeVisible();
  await page.getByRole('button', { name: 'Menu da conta' }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});

test('solicitante: registros próprios, notas internas e ações administrativas', async ({
  page,
  request,
}) => {
  const adminAuth = await request.post('/api/auth/login', { data: credentials('administrator') });
  expect(adminAuth.ok()).toBe(true);
  const { csrfToken: adminCsrf } = (await adminAuth.json()) as { csrfToken: string };
  const privateCreate = await request.post('/api/tickets', {
    headers: { 'x-csrf-token': adminCsrf },
    data: {
      kind: 'incident',
      title: `Registro privado E2E ${Date.now()}`,
      description: 'Chamado administrativo para comprovar isolamento entre solicitantes.',
      category: 'Infraestrutura',
      impact: 'low',
      urgency: 'low',
    },
  });
  expect(privateCreate.ok()).toBe(true);
  const privateTicket = (await privateCreate.json()) as Ticket;

  await login(page, 'requester');
  await expect(page.getByRole('link', { name: 'Administração', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Problemas', exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/admin')).status()).toBe(403);
  expect((await page.request.get(`/api/tickets/${privateTicket.id}`)).status()).toBe(404);
  const ownAuth = await page.request.get('/api/auth/me');
  const { csrfToken } = (await ownAuth.json()) as { csrfToken: string };
  const ownCreate = await page.request.post('/api/tickets', {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      kind: 'incident',
      title: `Meu chamado E2E ${Date.now()}`,
      description: 'Acesso ao próprio chamado deve continuar funcionando para o solicitante.',
      category: 'Aplicações',
      impact: 'medium',
      urgency: 'medium',
    },
  });
  expect(ownCreate.ok()).toBe(true);
  const ownTicket = (await ownCreate.json()) as Ticket;
  const adminNote = await request.post(`/api/tickets/${ownTicket.id}/comments`, {
    headers: { 'x-csrf-token': adminCsrf },
    data: { body: 'NOTA_INTERNA_RESTRITA_E2E', internal: true },
  });
  expect(adminNote.ok()).toBe(true);
  const ownDetailResponse = await page.request.get(`/api/tickets/${ownTicket.id}`);
  const ownDetail = (await ownDetailResponse.json()) as TicketDetail;
  expect(ownDetail.comments.some((comment) => comment.internal)).toBe(false);
  expect(ownDetailResponse.status()).toBe(200);
  const forbiddenStatus = await page.request.patch(`/api/tickets/${ownTicket.id}`, {
    headers: { 'x-csrf-token': csrfToken },
    data: { version: ownDetail.ticket.version, status: 'in_progress' },
  });
  expect(forbiddenStatus.status()).toBe(403);
  const forbiddenNote = await page.request.post(`/api/tickets/${ownTicket.id}/comments`, {
    headers: { 'x-csrf-token': csrfToken },
    data: { body: 'Tentativa de nota interna pelo solicitante.', internal: true },
  });
  expect(forbiddenNote.status()).toBe(403);
  const csrfMissing = await page.request.post(`/api/tickets/${ownTicket.id}/comments`, {
    data: { body: 'Sem token CSRF.', internal: false },
  });
  expect(csrfMissing.status()).toBe(403);

  await page.goto(`/tickets/${ownTicket.id}`);
  await expect(page.getByRole('heading', { name: ownTicket.title })).toBeVisible();
  await expect(page.getByText('NOTA_INTERNA_RESTRITA_E2E')).toHaveCount(0);
  await expect(page.getByLabel('Nota interna', { exact: true })).toHaveCount(0);
  await page.goto(`/tickets/${privateTicket.id}`);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: privateTicket.title })).toHaveCount(0);
  const ownList = await page.request.get('/api/tickets?kind=incident&limit=100');
  const { items } = (await ownList.json()) as { items: Ticket[] };
  expect(items.some((ticket) => ticket.id === privateTicket.id)).toBe(false);
});
