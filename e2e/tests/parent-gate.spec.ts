import { expect, test } from '@playwright/test';
import { E2E_FAMILY, holdFor, pairThisContext } from '../fixtures/family';

// AC (#18): "The parent gate blocks children (it can't be passed by taps alone)" (06 §3: hold the
// gate button for 2 s, then the parent PIN). Runs after golden journey 1 created the family.

test.describe('parent gate', () => {
  test('taps never open it; the hold alone shows only the PIN pad; the PIN opens it', async ({
    page,
  }) => {
    await pairThisContext(page, 'Gate test device');
    await page.goto('/parent/diagnostics');
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    const lock = page.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' });

    // A child tapping (and double-tapping) the lock, many times.
    for (let i = 0; i < 12; i++) await lock.click();
    await lock.dblclick();
    await expect(page.getByText('Enter your parent PIN')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeHidden();
    await expect(page.getByText('Grown-ups: keep holding for 2 seconds')).toBeVisible();

    // Letting go early does nothing.
    await holdFor(page, lock, 1200);
    await expect(page.getByText('Enter your parent PIN')).toBeHidden();

    // The full hold shows the PIN pad, still not the parent area.
    await holdFor(page, lock);
    await expect(page.getByText('Enter your parent PIN')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeHidden();

    // Mashing keys without the PIN keeps it shut.
    for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('That PIN isn’t right. Try again.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeHidden();

    // The parent's PIN (desktop keyboards can type it) opens the page asked for.
    await page.keyboard.type(E2E_FAMILY.pin);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
    await expect(page.locator('dd', { hasText: 'paired with the family' })).toBeVisible();

    // Lock returns to the island and closes the area again.
    await page.getByRole('button', { name: 'Lock' }).click();
    await page.goto('/parent');
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
  });

  test('a page whose file cannot load shows a calm error screen with safe ways out', async ({
    page,
  }) => {
    // No pairing needed (the API limits pairing tries): the page's file fails before any gate.
    // The parent pages' file never arrives (as if the device went offline before fetching it).
    await page.route(/\/assets\/area-[^/]*\.js$/, (route) => route.abort('internetdisconnected'));
    await page.goto('/parent/diagnostics');
    const screen = page.getByTestId('route-error');
    await expect(screen).toBeVisible();
    await expect(
      screen.getByRole('heading', { name: 'This part of the island didn’t open' }),
    ).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    // Back to the island stays in the running app: no new page load, so it works offline too.
    const documents: string[] = [];
    await page.route('**/*', (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      documents.push(route.request().url());
      return route.abort('internetdisconnected');
    });
    await screen.getByRole('button', { name: 'Back to the island' }).click();
    await expect(page.getByTestId('route-error')).toHaveCount(0);
    // This device never set up a family, so home is the first-run welcome.
    await expect(page).toHaveURL(/\/welcome$/);
    expect(documents).toEqual([]);
  });

  test('on a first-run device whose welcome file cannot load, the error screen offers Try again alone, and it works', async ({
    page,
  }) => {
    // No pairing needed. Home sends this device to the welcome screen, so Back to the island
    // would only lead back to the same error: the screen doesn't offer it.
    const chunk = /\/assets\/WelcomePage-[^/]*\.js$/;
    await page.route(chunk, (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    const screen = page.getByTestId('route-error');
    await expect(screen).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(screen.getByRole('button')).toHaveCount(1);
    await expect(screen.getByRole('button', { name: 'Back to the island' })).toHaveCount(0);
    // The connection comes back: Try again opens the welcome screen.
    await page.unroute(chunk);
    await screen.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('route-error')).toHaveCount(0);
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('a parent file that failed while the app warmed up loads on the first visit once the connection is back', async ({
    page,
  }) => {
    // No pairing needed. The idle warm-up's fetch of the parent pages' file fails (a dropped
    // connection), then requests work again before anyone opens the parent area.
    const chunk = /\/assets\/area-[^/]*\.js$/;
    await page.route(chunk, (route) => route.abort('internetdisconnected'));
    const failed = page.waitForEvent('requestfailed', {
      predicate: (request) => chunk.test(request.url()),
      timeout: 15_000,
    });
    await page.goto('/welcome');
    await failed;
    await page.unroute(chunk);
    // The first visit, inside the same document (no reload): the browser fetches the file again.
    const loaded = page.waitForResponse((r) => chunk.test(r.url()) && r.ok(), { timeout: 10_000 });
    await page.evaluate(() => {
      const state = history.state as { idx?: number } | null;
      history.pushState({ ...state, idx: (state?.idx ?? 0) + 1 }, '', '/parent');
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await loaded;
    // The page itself renders (a file that arrived but then failed to run would not get here).
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    await expect(page).toHaveURL(/\/parent$/);
    await expect(page.getByTestId('route-error')).toHaveCount(0);
  });

  test('is entered from the corner of the child home, and closes when the device signs out', async ({
    page,
    context,
  }) => {
    await pairThisContext(page, 'Corner test device');
    await page.goto('/');
    const corner = page.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' });
    await expect(corner).toBeVisible();
    // The child home shows no network status (06 §8).
    await expect(page.getByRole('status')).toHaveCount(0);

    // A tap on the corner stays on the child home; the 2 s hold goes straight to the PIN.
    await corner.click();
    await expect(page).toHaveURL(/\/$/);
    await holdFor(page, corner);
    await expect(page).toHaveURL(/\/parent$/);
    await expect(page.getByText('Enter your parent PIN')).toBeVisible();
    for (const d of E2E_FAMILY.pin)
      await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();

    // Diagnostics still opens when the connection drops right after the parent area opened: the
    // parent pages are one on-demand file, so it came with the parent home (no own file to fetch).
    await context.setOffline(true);
    try {
      await page.getByRole('link', { name: 'diagnostics page' }).click();
      await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
      await expect(page.getByTestId('route-error')).toHaveCount(0);
      const ownFile = await page.evaluate(() =>
        performance.getEntriesByType('resource').some((e) => /\/DiagnosticsPage-/.test(e.name)),
      );
      expect(ownFile).toBe(false);
    } finally {
      await context.setOffline(false);
    }
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();

    // Back to the island locks the area: the browser's Back shows the gate, not the parent page.
    await page.getByRole('button', { name: 'Back to the island' }).click();
    await expect(page).toHaveURL(/\/$/);
    // The child home has rendered (its corner entry shows), then the browser's Back.
    await expect(corner).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/parent$/);
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Parent area' })).toHaveCount(0);
    // This history entry carries the corner hold from moments ago, so the gate may go straight to
    // the PIN pad; otherwise it asks for the hold first. Either way the PIN is still needed.
    const gateLock = page.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' });
    if (await gateLock.isVisible()) await holdFor(page, gateLock);
    await expect(page.getByText('Enter your parent PIN')).toBeVisible();
    // A typed PIN and Enter unlock at once (focus starts on the 1 key).
    await page.keyboard.type(E2E_FAMILY.pin);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();

    // Signing this device out closes the parent area and ends the parent session. The device no
    // longer syncs: it lands on the join page, which says so; Back returns to the child home.
    await page.getByRole('button', { name: 'Sign this device out' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/join$/);
    await expect(
      page.getByText('This device is signed out, so it doesn’t sync.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/parent');
    await expect(page.getByRole('button', { name: 'Join with a code' })).toBeVisible();
    const pairStart = await page.request.post('/api/devices/pair/start', { data: {} });
    expect(pairStart.status()).toBe(401);

    // No other device at hand: the parent passphrase rejoins this one (its own family).
    await page.getByRole('button', { name: 'Join with a code' }).click();
    await expect(page).toHaveURL(/\/join$/);
    await page.getByRole('button', { name: 'Use the parent passphrase instead' }).click();
    await page.getByLabel('Parent passphrase').fill('not-the-passphrase');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(
      page.getByText('That passphrase isn’t right. Check it and try again.'),
    ).toBeVisible();
    await page.getByLabel('Parent passphrase').fill(E2E_FAMILY.passphrase);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/parent');
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join with a code' })).toHaveCount(0);
    // The passphrase's parent session ended after pairing.
    const after = await page.request.post('/api/devices/pair/start', { data: {} });
    expect(after.status()).toBe(401);
  });
});
