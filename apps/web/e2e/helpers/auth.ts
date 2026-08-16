import { expect, type Page } from '@playwright/test';

export function e2eCredentials(): { email: string; password: string } {
  return {
    email: process.env.E2E_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    password: process.env.E2E_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? 'change-me',
  };
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const { email, password } = e2eCredentials();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/projects/);
}
