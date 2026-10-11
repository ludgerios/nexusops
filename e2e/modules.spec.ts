import { expect, test } from '@playwright/test';
import type { Ticket, TicketDetail } from '@nexusops/shared';
import { credentials, login } from './helpers';

test('problema: investigação, associação real de incidente e encerramento', async ({ page }) => {
  await login(page);
  await page.goto('/problems');
  await page.getByRole('button', { name: 'Novo problema', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Novo problema' });
  const title = `Falha recorrente no enlace · E2E ${Date.now()}`;
  await create.getByLabel('Título', { exact: true }).fill(title);
  await create
    .getByLabel('Descrição', { exact: true })
    .fill('Investigar a recorrência de perda de conectividade no enlace demonstrativo.');
  await create.getByLabel('Categoria', { exact: true }).selectOption('Redes');
  const createdResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/tickets' && response.request().method() === 'POST',
  );
  await create.getByRole('button', { name: 'Criar problema', exact: true }).click();
  const problem = (await (await createdResponse).json()) as Ticket;
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar chamado', exact: true }).click();
  const edit = page.getByRole('dialog');
  const rootCause = 'Interface do gateway negociava o enlace com configuração incompatível.';
  const workaround = 'Usar enlace secundário enquanto a configuração definitiva é aplicada.';
  await edit.getByLabel('Causa raiz', { exact: true }).fill(rootCause);
  await edit.getByLabel('Solução de contorno', { exact: true }).fill(workaround);
  await edit.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByText(rootCause, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Associar incidente', exact: true }).click();
  const relation = page.getByRole('dialog', { name: 'Associar incidente' });
  const incidentSelect = relation.getByLabel('Incidente relacionado');
  await expect(incidentSelect.locator('option')).not.toHaveCount(1);
  const candidates = await incidentSelect
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
  let candidate: string | undefined;
  for (const id of candidates) {
    const available = (await (await page.request.get(`/api/tickets/${id}`)).json()) as TicketDetail;
    if (!available.relatedProblem) {
      candidate = id;
      break;
    }
  }
  expect(candidate).toBeTruthy();
  await incidentSelect.selectOption(candidate!);
  await relation.getByRole('button', { name: 'Associar', exact: true }).click();
  await expect(relation).toHaveCount(0);
  await expect(page.locator('.related-ticket')).toHaveCount(1);
  const detail = (await (
    await page.request.get(`/api/tickets/${problem.id}`)
  ).json()) as TicketDetail;
  expect(detail.relatedIncidents[0].id).toBe(candidate);
  const incident = (await (
    await page.request.get(`/api/tickets/${candidate}`)
  ).json()) as TicketDetail;
  expect(incident.relatedProblem?.id).toBe(problem.id);

  await page.getByLabel('Status', { exact: true }).selectOption('in_progress');
  await page.getByRole('button', { name: 'Atualizar status', exact: true }).click();
  await expect(
    page.getByLabel('Status', { exact: true }).locator('option[value="resolved"]'),
  ).toHaveCount(1);
  await page.getByLabel('Status', { exact: true }).selectOption('resolved');
  await page
    .getByLabel('Resolução do chamado')
    .fill('Negociação do enlace corrigida e estabilidade validada no ambiente demonstrativo.');
  await page.getByRole('button', { name: 'Atualizar status', exact: true }).click();
  await expect(
    page.locator('.ticket-heading-meta').getByText('Resolvido', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('closed');
  await page.getByRole('button', { name: 'Atualizar status', exact: true }).click();
  await expect(
    page.locator('.ticket-heading-meta').getByText('Fechado', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Associar incidente', exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByText(rootCause, { exact: true })).toBeVisible();
  await expect(page.locator('.related-ticket')).toHaveCount(1);
});

test('solicitação: solicitante abre, comenta e acompanha a conclusão persistida', async ({
  page,
  request,
}) => {
  await login(page, 'requester');
  await page.goto('/requests');
  await page.getByRole('button', { name: 'Nova solicitação', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Nova solicitação' });
  const title = `Instalar editor demonstrativo · E2E ${Date.now()}`;
  await create.getByLabel('Título', { exact: true }).fill(title);
  await create
    .getByLabel('Descrição', { exact: true })
    .fill('Solicito instalar o editor de código fictício no equipamento de demonstração.');
  await create.getByLabel('Categoria', { exact: true }).selectOption('Software');
  await create.getByLabel('Tipo de solicitação').selectOption('Instalação de software');
  const createdResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/tickets' && response.request().method() === 'POST',
  );
  await create.getByRole('button', { name: 'Criar solicitação', exact: true }).click();
  const ticket = (await (await createdResponse).json()) as Ticket;
  expect(ticket.kind).toBe('request');
  expect(ticket.requestType).toBe('Instalação de software');
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toHaveCount(0);
  await page
    .getByLabel('Comentário', { exact: true })
    .fill('O equipamento estará disponível para configuração durante a demonstração.');
  await page.getByRole('button', { name: 'Adicionar comentário', exact: true }).click();
  await expect(
    page.getByText('O equipamento estará disponível para configuração durante a demonstração.', {
      exact: true,
    }),
  ).toBeVisible();

  const agentLogin = await request.post('/api/auth/login', { data: credentials('agent') });
  expect(agentLogin.ok()).toBe(true);
  const auth = (await agentLogin.json()) as { user: { id: string }; csrfToken: string };
  const initial = (await (await request.get(`/api/tickets/${ticket.id}`)).json()) as TicketDetail;
  const startedResponse = await request.patch(`/api/tickets/${ticket.id}`, {
    headers: { 'x-csrf-token': auth.csrfToken },
    data: { version: initial.ticket.version, status: 'in_progress', assigneeId: auth.user.id },
  });
  expect(startedResponse.ok()).toBe(true);
  const started = (await startedResponse.json()) as Ticket;
  const resolved = await request.patch(`/api/tickets/${ticket.id}`, {
    headers: { 'x-csrf-token': auth.csrfToken },
    data: {
      version: started.version,
      status: 'resolved',
      resolution: 'Editor instalado e validado no equipamento demonstrativo.',
    },
  });
  expect(resolved.ok()).toBe(true);
  await page.reload();
  await expect(
    page.locator('.ticket-heading-meta').getByText('Resolvido', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Editor instalado e validado no equipamento demonstrativo.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Histórico/ }).click();
  await expect(
    page.getByText('Status alterado de Em andamento para Resolvido.', { exact: true }),
  ).toBeVisible();
});

test('administração: criar e editar equipe/usuário e configurar regra', async ({ page }) => {
  await login(page);
  const originalSession = (await (await page.request.get('/api/auth/me')).json()) as {
    user: { id: string; name: string };
    csrfToken: string;
  };
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Equipes', exact: true }).click();
  await page.getByRole('button', { name: 'Nova equipe', exact: true }).click();
  const createTeam = page.getByRole('dialog', { name: 'Nova equipe' });
  const teamName = `Equipe de QA ${Date.now()}`;
  await createTeam.getByLabel('Nome da equipe').fill(teamName);
  await createTeam
    .getByLabel('Descrição da equipe')
    .fill('Equipe fictícia criada por uma jornada automatizada.');
  await createTeam.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(createTeam).toHaveCount(0);
  await expect(page.getByRole('heading', { name: teamName, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Editar equipe ${teamName}`, exact: true }).click();
  const editTeam = page.getByRole('dialog', { name: 'Editar equipe' });
  await editTeam
    .getByLabel('Descrição da equipe')
    .fill('Equipe fictícia com descrição atualizada e persistida.');
  await editTeam.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(editTeam).toHaveCount(0);
  const savedTeam = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: teamName, exact: true }) });
  await expect(
    savedTeam.getByText('Equipe fictícia com descrição atualizada e persistida.', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Usuários', exact: true }).click();
  await page.getByRole('button', { name: 'Novo usuário', exact: true }).click();
  const createUser = page.getByRole('dialog', { name: 'Novo usuário' });
  const userName = `Agente QA ${Date.now()}`;
  await createUser.getByLabel('Nome', { exact: true }).fill(userName);
  await createUser.getByLabel('E-mail', { exact: true }).fill(`qa-${Date.now()}@nexusops.local`);
  await createUser.getByLabel('Senha', { exact: true }).fill(`Nxo-test!${Date.now()}x`);
  await createUser.getByLabel('Equipe', { exact: true }).selectOption({ label: teamName });
  await createUser.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
  await expect(createUser).toHaveCount(0);
  await page.getByRole('button', { name: `Editar usuário ${userName}`, exact: true }).click();
  const editUser = page.getByRole('dialog', { name: 'Editar usuário' });
  await editUser.getByLabel('Nome', { exact: true }).fill(`${userName} atualizado`);
  await editUser.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
  await expect(editUser).toHaveCount(0);
  await expect(page.getByText(`${userName} atualizado`, { exact: true })).toBeVisible();

  const originalName = originalSession.user.name;
  const updatedName = `${originalName} revisão QA`;
  await page.getByRole('button', { name: `Editar usuário ${originalName}`, exact: true }).click();
  const editSelf = page.getByRole('dialog', { name: 'Editar usuário' });
  await editSelf.getByLabel('Nome', { exact: true }).fill(updatedName);
  await editSelf.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
  await expect(editSelf).toHaveCount(0);
  const persistedSession = await page.request.get('/api/auth/me');
  expect(persistedSession.status()).toBe(200);
  const persistedAuth = (await persistedSession.json()) as typeof originalSession;
  expect(persistedAuth.user.name).toBe(updatedName);
  expect(persistedAuth.csrfToken).toBe(originalSession.csrfToken);
  await page.reload();
  await expect(
    page.getByRole('button', { name: `Editar usuário ${updatedName}`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Editar usuário ${updatedName}`, exact: true }).click();
  const restoreSelf = page.getByRole('dialog', { name: 'Editar usuário' });
  await restoreSelf.getByLabel('Nome', { exact: true }).fill(originalName);
  await restoreSelf.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
  await expect(restoreSelf).toHaveCount(0);
  const restoredSession = await page.request.get('/api/auth/me');
  expect(restoredSession.status()).toBe(200);
  expect(((await restoredSession.json()) as typeof originalSession).user.name).toBe(originalName);

  await page.goto('/automations');
  const near = page
    .locator('.automation-card')
    .filter({ has: page.getByRole('heading', { name: 'SLA próximo do vencimento', exact: true }) });
  await expect(near).toBeVisible();
  await near.getByRole('button', { name: /Configurar limiar/ }).click();
  const configure = page.getByRole('dialog', { name: 'Configurar automação' });
  await configure.getByLabel('Percentual consumido para alertar').fill('79');
  await configure.getByRole('button', { name: 'Salvar regra', exact: true }).click();
  await expect(configure).toHaveCount(0);
  await expect(near.getByRole('button', { name: /Configurar limiar \(79%\)/ })).toBeVisible();
  await near.getByRole('button', { name: /Configurar limiar/ }).click();
  await page.getByRole('dialog').getByLabel('Percentual consumido para alertar').fill('80');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar regra', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
