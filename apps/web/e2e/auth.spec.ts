import { expect, test } from '@playwright/test';

import { e2eCredentials, loginAsAdmin } from './helpers/auth.js';

test.describe('auth', () => {
  test('login reaches projects', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
  });

  test('logout returns to login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('bad password shows error', async ({ page }) => {
    const { email } = e2eCredentials();
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
