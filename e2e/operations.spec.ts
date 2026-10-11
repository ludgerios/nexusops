import { expect, test } from '@playwright/test';
import type { Ticket } from '@nexusops/shared';
import { login } from './helpers';

test('notificações: abrir chamado relacionado e marcar todas como lidas', async ({ page }) => {
  await login(page);
  const auth = (await (await page.request.get('/api/auth/me')).json()) as {
    user: { id: string };
    csrfToken: string;
  };
  const title = `Alerta de operação demonstrativa ${Date.now()}`;
  const createdResponse = await page.request.post('/api/tickets', {
    headers: { 'x-csrf-token': auth.csrfToken },
    data: {
      kind: 'incident',
      title,
      description:
        'Incidente crítico fictício para verificar o centro de notificações persistidas.',
      category: 'Infraestrutura',
      impact: 'high',
      urgency: 'high',
      assigneeId: auth.user.id,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const ticket = (await createdResponse.json()) as Ticket;
  await page.goto('/notifications');
  const notice = page.locator('.notification').filter({
    has: page.getByRole('heading', { name: `Incidente crítico ${ticket.number}`, exact: true }),
  });
  await expect(notice).toBeVisible();
  await notice.getByRole('link', { name: ticket.number }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.goto('/notifications');
  const current = (await (await page.request.get('/api/notifications')).json()) as {
    unread: number;
  };
  const readAll = page.getByRole('button', { name: 'Marcar todas como lidas', exact: true });
  expect(current.unread).toBeGreaterThan(0);
  await expect(readAll).toBeEnabled();
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith('/api/notifications/read-all') && result.request().method() === 'POST',
  );
  await readAll.click();
  expect((await response).ok()).toBe(true);
  await expect(readAll).toBeDisabled();
  expect(
    ((await (await page.request.get('/api/notifications')).json()) as { unread: number }).unread,
  ).toBe(0);
  await page.getByRole('button', { name: /^Não lidas/ }).click();
  await expect(page.getByRole('heading', { name: 'Você está em dia', exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Marcar todas como lidas', exact: true }),
  ).toBeDisabled();
});

test('relatórios: filtro de período/tipo e download CSV com registros da API', async ({ page }) => {
  await login(page);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Relatórios.' })).toBeVisible();
  await page.getByLabel('Período dos relatórios').selectOption('7');
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/tickets' &&
      url.searchParams.get('kind') === 'request' &&
      url.searchParams.get('days') === '7'
    );
  });
  await page.getByLabel('Tipo de registro no relatório').selectOption('request');
  expect((await filtered).ok()).toBe(true);
  const expected = (await (
    await page.request.get('/api/tickets?kind=request&days=7&limit=100')
  ).json()) as { items: Ticket[]; total: number };
  expect(expected.total).toBeGreaterThan(0);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^nexusops-relatorio-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();
  expect(stream).toBeTruthy();
  let csv = '';
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain('"Número";"Tipo";"Título"');
  for (const ticket of expected.items) expect(csv).toContain(`"${ticket.number}";"request"`);
  expect(csv).not.toContain(';"incident";');
  expect(csv).not.toContain(';"problem";');
  await expect(
    page.getByRole('status').filter({ hasText: `${expected.total} registros exportados.` }),
  ).toBeVisible();
});
