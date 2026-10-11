import { expect, test } from '@playwright/test';
import { assertNoDocumentOverflow, login } from './helpers';

for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`navegação, dashboard, lista e formulário em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
    await assertNoDocumentOverflow(page);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Evolução dos incidentes' })).toBeVisible();
    await assertNoDocumentOverflow(page);

    const menu = page.getByRole('button', { name: 'Abrir menu', exact: true });
    if (await menu.isVisible()) {
      await menu.click();
      await expect(
        page.getByRole('navigation').getByRole('link', { name: 'Incidentes', exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Incidentes', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Incidentes.' })).toBeVisible();
    await expect(page.locator('.ticket-table')).toBeVisible();
    await assertNoDocumentOverflow(page);
    await page.getByRole('button', { name: 'Novo incidente', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo incidente' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Título', { exact: true }).fill('Teste responsivo do formulário');
    await dialog
      .getByLabel('Descrição', { exact: true })
      .fill('Campos e controles precisam caber no viewport sem overflow horizontal.');
    await dialog.getByLabel('Categoria', { exact: true }).selectOption('Aplicações');
    await assertNoDocumentOverflow(page);
    const formDimensions = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(formDimensions.scrollWidth).toBeLessThanOrEqual(formDimensions.width + 1);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.locator('.ticket-table .ticket-cell').first().click();
    await expect(page.getByRole('heading', { name: 'Informações do chamado' })).toBeVisible();
    await assertNoDocumentOverflow(page);
    await expect(page.getByLabel('Comentário', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Histórico/ }).click();
    await expect(page.locator('.history-list')).toBeVisible();
    await assertNoDocumentOverflow(page);
  });
}
