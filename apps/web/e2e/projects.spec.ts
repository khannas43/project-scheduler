import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './helpers/auth.js';

const DEMO = {
  aurora: 'Aurora Website Launch',
  northwind: 'Northwind Plant Retrofit',
  orbit: 'Orbit Mobile Release',
} as const;

test.describe('projects', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('lists seeded demo projects', async ({ page }) => {
    await expect(page.getByRole('link', { name: DEMO.aurora, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: DEMO.northwind, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: DEMO.orbit, exact: true })).toBeVisible();
  });

  test('opens a project schedule', async ({ page }) => {
    await page.getByRole('link', { name: DEMO.aurora, exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(page.getByRole('navigation', { name: 'Project' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name: 'Schedule', exact: true }),
    ).toBeVisible();
  });
});
