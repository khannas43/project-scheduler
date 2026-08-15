import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loginAsAdmin } from './helpers/auth.js';

const AURORA = 'Aurora Website Launch';

const fixtureCsv = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'minimal-import.csv',
);

test.describe('project workspace', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: AURORA, exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Project' })).toBeVisible();
  });

  test('edits a task name on the schedule grid', async ({ page }) => {
    const trigger = page.locator('button.cell-edit-trigger').first();
    await expect(trigger).toBeVisible();
    const previous = (await trigger.innerText()).trim();
    await trigger.click();
    const editor = page.locator('input.cell-input').first();
    await expect(editor).toBeVisible();
    await editor.fill(`${previous} (e2e)`);
    await editor.press('Enter');
    await expect(page.getByText(`${previous} (e2e)`).first()).toBeVisible({ timeout: 15_000 });
  });

  test('imports a spreadsheet into the project', async ({ page }) => {
    await page.getByTestId('schedule-import-spreadsheet-toolbar').click();
    await expect(page.getByRole('heading', { name: /Import Excel \/ CSV/i })).toBeVisible();
    await page.getByTestId('import-spreadsheet-file').setInputFiles(fixtureCsv);
    await page.getByTestId('import-spreadsheet-apply').click();
    await expect(page.getByText(/E2E Imported Root|imported/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('opens custom reports', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports/);
    await expect(page.getByRole('heading', { name: 'Custom report' })).toBeVisible();
    await page.getByTestId('custom-report-preview').click();
    await expect(page.getByTestId('custom-report-preview-table')).toBeVisible({ timeout: 15_000 });
  });

  test('navigates to people and help', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name: 'People' }).click();
    await expect(page).toHaveURL(/\/people/);
    await page.getByTestId('topbar-help').click();
    await expect(page).toHaveURL(/\/help/);
  });
});
