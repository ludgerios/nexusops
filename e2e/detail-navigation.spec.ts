import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('rascunho e nota interna ficam restritos ao chamado em edição', async ({ page }) => {
  await login(page);
  const session = await (await page.request.get('/api/auth/me')).json();
  const tickets = [];
  for (const suffix of ['origem', 'destino']) {
    const response = await page.request.post('/api/tickets', {
      headers: { 'x-csrf-token': session.csrfToken },
      data: {
        kind: 'incident',
        title: `Navegação ${suffix} ${Date.now()}`,
        description: 'Registro fictício para verificar isolamento do formulário de comentário.',
        category: 'Aplicações',
        impact: 'low',
        urgency: 'low',
      },
    });
    expect(response.status()).toBe(201);
    tickets.push(await response.json());
  }
  await page.goto(`/tickets/${tickets[0].id}`);
  await page
    .getByLabel('Comentário', { exact: true })
    .fill('Rascunho exclusivo do chamado de origem.');
  await page.getByRole('checkbox', { name: 'Nota interna · apenas equipe' }).check();
  await page.getByLabel('Busca global').fill(tickets[1].number);
  await page
    .locator('.search-results')
    .getByRole('button')
    .filter({ hasText: tickets[1].number })
    .click();
  await expect(page.getByRole('heading', { name: tickets[1].title, exact: true })).toBeVisible();
  await expect(page.getByLabel('Comentário', { exact: true })).toHaveValue('');
  await expect(
    page.getByRole('checkbox', { name: 'Nota interna · apenas equipe' }),
  ).not.toBeChecked();
  const destination = await (await page.request.get(`/api/tickets/${tickets[1].id}`)).json();
  expect(destination.comments).toHaveLength(0);
});
