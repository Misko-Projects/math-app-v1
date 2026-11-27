import { expect, test } from '@playwright/test';
import { seedLocalChild } from '../fixtures/localChild';

// The guide chooser (05 §1, §10): a child with no guide yet chooses one before the island, once;
// the choice is kept on the profile; tapping the guide on the island opens the chooser again, and
// Home leaves it without a change. The child is local to this browser (no pairing, no sync).

const CHILD = {
  id: '019c0000-0000-7000-8000-00000000e2a7',
  name: 'Ivy',
  grade: 'K' as const,
  guide: null,
};

test('first start: choose a guide, see it on the island, switch it from the island', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/audio/manifest.json', (route) => route.abort());
  await seedLocalChild(page, CHILD);
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();

  // Before the island: the chooser, nothing picked, and Let's go! waiting for a pick.
  const chooser = page.getByTestId('guide-chooser');
  await expect(chooser).toBeVisible();
  await expect(page.getByTestId('child-home')).toHaveCount(0);
  const go = page.getByRole('button', { name: "Let's go!" });
  await expect(go).toBeDisabled();
  // No way out but choosing at first start.
  await expect(chooser.getByRole('button', { name: 'Go home' })).toHaveCount(0);

  const bunny = page.getByRole('button', { name: '22, the bunny' });
  const turtle = page.getByRole('button', { name: 'Shelly, the turtle' });
  for (const card of [bunny, turtle]) {
    const box = await card.boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(80);
  }
  await bunny.click();
  await expect(bunny).toHaveAttribute('aria-pressed', 'true');
  await expect(turtle).toHaveAttribute('aria-pressed', 'false');
  await go.click();

  // On the island: the bunny says the island's line, and the choice is on the profile.
  await expect(page.getByTestId('child-home')).toBeVisible();
  const guide = page.getByTestId('island-guide');
  await expect(guide.locator('svg[data-character="guide"]')).toHaveAttribute('data-guide', '22');
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          new Promise<unknown>((resolve, reject) => {
            const open = indexedDB.open('number-island');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const get = open.result.transaction('profiles').objectStore('profiles').get(id);
              get.onsuccess = () => {
                open.result.close();
                resolve((get.result as { guide?: string } | undefined)?.guide);
              };
            };
          }),
        CHILD.id,
      ),
    )
    .toBe('22');

  // Switching: tap the guide; the chooser shows the current guide; Home goes back unchanged.
  await guide.click();
  await expect(chooser).toBeVisible();
  await expect(bunny).toHaveAttribute('aria-pressed', 'true');
  await chooser.getByRole('button', { name: 'Go home' }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();
  await expect(guide.locator('svg[data-character="guide"]')).toHaveAttribute('data-guide', '22');

  // Switching to Shelly sticks.
  await guide.click();
  await turtle.click();
  await go.click();
  await expect(guide.locator('svg[data-character="guide"]')).toHaveAttribute(
    'data-guide',
    'shelly',
  );

  expect(errors).toEqual([]);
});
