import { expect, test } from '@playwright/test';
import type { Dashboard, Ticket, TicketDetail, User } from '@nexusops/shared';
import { login } from './helpers';

test('incidente: criar, listar, atribuir, atender, comentar, resolver e atualizar indicadores', async ({
  page,
}) => {
  await login(page);
  const before = (await (await page.request.get('/api/dashboard?days=30')).json()) as Dashboard;
  const title = `VPN indisponível · jornada E2E ${Date.now()}`;
  await page.getByRole('link', { name: 'Novo incidente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo incidente' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog
    .getByLabel('Descrição', { exact: true })
    .fill('Usuários do escritório demonstrativo não conseguem estabelecer conexão VPN.');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption('Redes');
  await dialog.getByLabel('Impacto', { exact: true }).selectOption('high');
  await dialog.getByLabel('Urgência', { exact: true }).selectOption('high');
  await expect(dialog.getByText('P1', { exact: false })).toBeVisible();
  const [createdResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tickets' &&
        response.request().method() === 'POST',
    ),
    dialog.getByRole('button', { name: 'Criar incidente', exact: true }).click(),
  ]);
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as Ticket;
  expect(created.priority).toBe(1);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Voltar para incidentes' }).click();
  await page.getByLabel('Pesquisar incidentes').fill(title);
  const record = page.getByRole('link').filter({ hasText: title });
  await expect(record).toHaveCount(1);
  await record.click();
  const meta = (await (await page.request.get('/api/meta')).json()) as { users: User[] };
  const agent = meta.users.find((user) => user.role === 'agent' && user.active);
  expect(agent).toBeDefined();
  await page.getByLabel('Responsável', { exact: true }).selectOption(agent!.id);
  const [assignedResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/tickets/${created.id}`) &&
        response.request().method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Salvar atribuição', exact: true }).click(),
  ]);
  expect(assignedResponse.ok()).toBe(true);
  const assigned = (await assignedResponse.json()) as Ticket;
  expect(assigned.priority).toBe(1);
  expect(assigned.impact).toBe('high');
  expect(assigned.urgency).toBe('high');
  expect(assigned.resolutionDueAt).toBe(created.resolutionDueAt);
  await expect(page.getByRole('button', { name: 'Salvar atribuição', exact: true })).toBeDisabled();

  await page.getByLabel('Status', { exact: true }).selectOption('in_progress');
  const [inProgressResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/tickets/${created.id}`) &&
        response.request().method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Atualizar status', exact: true }).click(),
  ]);
  expect(inProgressResponse.ok()).toBe(true);
  expect(((await inProgressResponse.json()) as Ticket).priority).toBe(1);
  await expect(
    page.getByLabel('Status', { exact: true }).locator('option[value="resolved"]'),
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Editar chamado', exact: true }).click();
  const edit = page.getByRole('dialog');
  await edit
    .getByLabel('Descrição', { exact: true })
    .fill(
      'VPN indisponível. A equipe confirmou erro no certificado do gateway e iniciou investigação.',
    );
  await edit.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(
    page.getByText(
      'VPN indisponível. A equipe confirmou erro no certificado do gateway e iniciou investigação.',
      { exact: true },
    ),
  ).toBeVisible();

  const comment =
    'Certificado do gateway renovado. Validação de conectividade concluída com o solicitante.';
  await page.getByLabel('Comentário', { exact: true }).fill(comment);
  await page.getByRole('button', { name: 'Adicionar comentário', exact: true }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Comentário', { exact: true })).toHaveValue('');
  await page.getByLabel('Status', { exact: true }).selectOption('resolved');
  const resolution = 'Certificado atualizado no gateway. Serviço VPN restabelecido e validado.';
  await page.getByLabel('Resolução do chamado', { exact: true }).fill(resolution);
  await page.getByRole('button', { name: 'Atualizar status', exact: true }).click();
  await expect(
    page.locator('.ticket-heading-meta').getByText('Resolvido', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.resolution-panel p')).toHaveText(resolution);
  await page.getByRole('button', { name: /^Histórico/ }).click();
  await expect(
    page.getByText(`Responsável alterado para ${agent!.name}.`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Status alterado de Em andamento para Resolvido.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Comentário registrado.', { exact: true })).toBeVisible();
  const detail = (await (
    await page.request.get(`/api/tickets/${created.id}`)
  ).json()) as TicketDetail;
  expect(detail.ticket.status).toBe('resolved');
  expect(detail.ticket.assigneeId).toBe(agent!.id);
  expect(detail.ticket.responseAt).toBeTruthy();
  expect(detail.ticket.resolutionSlaState).toBe('met');
  expect(detail.history.some((event) => event.event === 'first_response')).toBe(true);

  await page.goto('/incidents');
  await page.getByLabel('Pesquisar incidentes').fill(title);
  await page.getByLabel('Filtrar por status').selectOption('resolved');
  await page.getByLabel('Filtrar por prioridade').selectOption('1');
  await expect(page.getByRole('link').filter({ hasText: title })).toHaveCount(1);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Visão geral.' })).toBeVisible();
  const after = (await (await page.request.get('/api/dashboard?days=30')).json()) as Dashboard;
  expect(after.metrics.totalIncidents).toBe(before.metrics.totalIncidents + 1);
  expect(after.metrics.resolvedIncidents).toBe(before.metrics.resolvedIncidents + 1);
  const filtered = page.waitForResponse((response) =>
    response.url().includes('/api/dashboard?days=7'),
  );
  await page.getByLabel('Período do dashboard').selectOption('7');
  const filteredResponse = await filtered;
  expect(filteredResponse.ok()).toBe(true);
  const sevenDays = (await filteredResponse.json()) as Dashboard;
  await expect(
    page.locator('.metric-card').filter({ hasText: 'Incidentes abertos' }).locator('.metric-value'),
  ).toHaveText(`${sevenDays.metrics.openIncidents}`);
});
