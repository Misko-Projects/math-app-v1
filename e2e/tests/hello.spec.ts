import { expect, test } from '@playwright/test';

test.describe('hello island', { tag: '@smoke' }, () => {
  test('a brand-new device opens on the welcome screen with no console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome to Number Island' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /island/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Set up our island/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Join with a code/ })).toBeVisible();

    // No horizontal overflow at this viewport.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    // Let late resources (fonts, service worker registration) settle before checking the console.
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('GET /api/health returns ok JSON', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      version: expect.any(String),
      contentVersion: expect.any(String),
      ai: {
        feedback: expect.any(Boolean),
        vision: expect.any(Boolean),
        summary: expect.any(Boolean),
      },
    });
  });

  test('unknown deep links fall back to the app shell', async ({ page }) => {
    await page.goto('/some/deep/link');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome to Number Island' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/);
  });
});
