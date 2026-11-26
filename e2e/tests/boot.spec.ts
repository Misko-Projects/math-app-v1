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

// 02 §6a: the engine's item core (generators, checkers, misconception rules) is a chunk of its own,
// fetched during boot. A registry marker in the file's text identifies it, whatever its hashed name.
test.describe('app boot: the engine item core', () => {
  // The chunk must come from the network here, also once the service worker precaches it.
  test.use({ serviceWorkers: 'block' });
  const ITEM_CORE_MARK = 'number-island:item-core/generators';

  test('is fetched as its own chunk, and Try again recovers after it failed to load', async ({
    page,
  }) => {
    let blocked = true;
    const itemCoreRequests: string[] = [];
    const otherScripts: string[] = [];
    await page.route('**/assets/*.js', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const { pathname } = new URL(route.request().url());
      if (!body.includes(ITEM_CORE_MARK)) {
        otherScripts.push(pathname);
        await route.fulfill({ response, body });
      } else {
        itemCoreRequests.push(pathname);
        if (blocked) await route.abort('failed');
        else await route.fulfill({ response, body });
      }
    });

    // The chunk does not arrive: boot stops on the screen for game files that did not load.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'The game files didn’t load' })).toBeVisible();
    expect(itemCoreRequests).toHaveLength(1);
    // The entry script loaded and ran without the item core in it.
    expect(otherScripts.length).toBeGreaterThan(0);

    // The network is back: the same document recovers, without a reload.
    blocked = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome to Number Island' }),
    ).toBeVisible();
    expect(itemCoreRequests).toHaveLength(2);
    expect(new Set(itemCoreRequests).size).toBe(1);
    // The welcome screen prefetches later chunks through the handler above. Let any fetch still
    // in it finish before the test ends: one that outlived the test failed the run as
    // "route.fetch: Test ended", reported against whatever test the worker ran next (#35).
    await page.unrouteAll({ behavior: 'wait' });
  });
});
