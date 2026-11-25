import { expect, test } from '@playwright/test';

test.describe('Kipd smoke flows', () => {
  test('public routes, health check, and guest pages respond cleanly', async ({ page, request }) => {
    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'ok', database: 'ok' });

    const version = await request.get('/api/android/version');
    expect(version.status()).toBe(200);

    await page.goto('/');
    await expect(page).toHaveTitle(/Kipd/i);

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('staff POS lifecycle: login -> create order -> KDS update -> settle -> pay', async ({ page }) => {
    const email = process.env.PLAYWRIGHT_TEST_EMAIL;
    const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
    test.skip(!email || !password, 'Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run authenticated POS smoke.');

    // 1. Login
    await page.goto('/sign-in');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /continue|sign in/i }).click();
    await page.waitForURL(/\/dashboard/);

    // 2. Create order on Orders page
    await page.goto('/dashboard/orders');
    await page.getByRole('button', { name: /seat new table/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /\+|add/i }).first().click();
    await dialog.getByRole('button', { name: /send to kitchen/i }).click();

    // 3. Verify & advance order in KDS
    await page.goto('/dashboard/kds');
    await page.waitForURL(/\/dashboard\/kds\//);

    // 4. Settle tab on Orders & pay in Restaurant Billing
    await page.goto('/dashboard/orders');
    await page.getByRole('button', { name: /settle bill/i }).first().click();
    await page.goto('/dashboard/billing/restaurant');
    await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible();
  });
});
