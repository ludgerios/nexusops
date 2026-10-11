import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('capturas reais das telas principais', async ({ page }) => {
  const directory = resolve(
    process.cwd(),
    process.env.E2E_UPDATE_SCREENSHOTS === '1' ? 'docs/screenshots' : 'test-results/screenshots',
  );
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await page.screenshot({
    path: resolve(directory, 'login.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Evolução dos incidentes' })).toBeVisible();
  await page.screenshot({
    path: resolve(directory, 'dashboard.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(directory, 'dashboard-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const [route, heading, name] of [
    ['/incidents', 'Incidentes', 'incidents'],
    ['/problems', 'Problemas', 'problems'],
    ['/slas', 'Gestão de SLAs', 'slas'],
    ['/automations', 'Automações', 'automations'],
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole('heading', { name: new RegExp(`^${heading}`), level: 1 }),
    ).toBeVisible();
    await expect(page.locator('.loading, .skeleton-layout')).toHaveCount(0);
    await page.screenshot({
      path: resolve(directory, `${name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

  await page.goto('/incidents');
  const incident = page.locator('.ticket-table .ticket-cell').first();
  await expect(incident).toBeVisible();
  await incident.click();
  await expect(page.getByRole('heading', { name: 'Informações do chamado' })).toBeVisible();
  await page.screenshot({
    path: resolve(directory, 'detail.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
