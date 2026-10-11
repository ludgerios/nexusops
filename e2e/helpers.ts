import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

type DemoCredentials = { password: string; users: { email: string; role: string }[] };

export function credentials(role: 'administrator' | 'agent' | 'requester') {
  const file = resolve(process.cwd(), '.demo-credentials');
  let demo: DemoCredentials;
  try {
    demo = JSON.parse(readFileSync(file, 'utf8')) as DemoCredentials;
  } catch {
    throw new Error('Credenciais locais ausentes. Execute npm run setup antes dos E2E.');
  }
  const user = demo.users.find((candidate) => candidate.role === role);
  if (!user || !demo.password) throw new Error(`Seed não contém credenciais para ${role}.`);
  return { email: user.email, password: demo.password };
}

export async function login(
  page: Page,
  role: 'administrator' | 'agent' | 'requester' = 'administrator',
) {
  const user = credentials(role);
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral.' })).toBeVisible();
  await expect(page.getByLabel('Período do dashboard')).toBeVisible();
}

export async function assertNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
}
