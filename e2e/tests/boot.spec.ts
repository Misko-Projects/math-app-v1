import { expect, test } from '@playwright/test';

// The app boot (W00): content is fetched as static assets (02 §6), the local database opens, and a
// fresh device does not sync before setup (apps/web/src/data/README.md).
test.describe('app boot', () => {
  test('loads the content assets, opens the local database and stays local-only', async ({
    page,
  }) => {
    const contentUrls: string[] = [];
    const syncCalls: string[] = [];
    page.on('request', (req) => {
      const { pathname } = new URL(req.url());
      if (pathname.startsWith('/content/')) contentUrls.push(pathname);
      if (pathname === '/api/sync') syncCalls.push(pathname);
    });

    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome to Number Island' }),
    ).toBeVisible();

    expect(contentUrls[0]).toBe('/content/index.json');
    // Production builds serve content-hashed files.
    expect(contentUrls).toContainEqual(
      expect.stringMatching(/^\/content\/narration\.[0-9a-f]{8}\.json$/),
    );
    expect(contentUrls).toContainEqual(
      expect.stringMatching(/^\/content\/game\.[0-9a-f]{8}\.json$/),
    );

    const databases = await page.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name),
    );
    expect(databases).toContain('number-island');
    expect(syncCalls).toEqual([]);
  });
});
