import { expect, type Page, test } from '@playwright/test';
import { seedLocalChild, seedLocalEvents } from '../fixtures/localChild';
import {
  ADA,
  BEN,
  DISPLACED,
  ROAD_LENGTH,
  STANDING,
  sharedIslandEvents,
} from '../fixtures/sharedIsland';

// #22 part 3, the shared island: two children's events from two tablets show on one island.
// Both avatars stand on the map, each building carries the badge of who placed it and the shared
// project the badges of both who gave to it, the Storehouse piles are tagged by their makers,
// and of two buildings placed on the same plots while offline only the first stands: the child
// whose building lost its plots is told once.
//
// Both children and all events are local to this browser (no pairing, no sync). Nothing here
// waits on, or asserts, elapsed real time.

const VIEWPORTS = [
  { width: 960, height: 600 },
  { width: 1280, height: 800 },
];

async function openIsland(page: Page, name: string) {
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();
  await expect(page.getByTestId('requests').locator('[data-request]').first()).toBeVisible();
}

/** The page does not scroll, and every picture of `selector` is whole on screen. */
async function expectWhole(page: Page, selector: string) {
  const report = await page.evaluate((sel) => {
    const outside = Array.from(document.querySelectorAll(sel))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
      .map((r) => [
        Math.round(r.left),
        Math.round(r.top),
        Math.round(r.right),
        Math.round(r.bottom),
      ]);
    return {
      w: document.documentElement.scrollWidth - innerWidth,
      h: document.documentElement.scrollHeight - innerHeight,
      outside,
    };
  }, selector);
  expect(report).toEqual({ w: 0, h: 0, outside: [] });
}

/** No picture of `selector` lies under a control of the screen (a button or a request). */
async function expectUncovered(page: Page, selector: string) {
  const covered = await page.evaluate((sel) => {
    const home = document.querySelector('[data-testid="child-home"]');
    const controls = Array.from(home?.querySelectorAll('button, [role="status"]') ?? [])
      .filter((b) => !b.closest('dialog'))
      .map((b) => ({ name: b.getAttribute('aria-label') ?? '', r: b.getBoundingClientRect() }))
      .filter((c) => c.r.width > 0);
    return Array.from(document.querySelectorAll(sel)).flatMap((el) => {
      const r = el.getBoundingClientRect();
      return controls
        .filter(
          (c) =>
            r.left < c.r.right && r.right > c.r.left && r.top < c.r.bottom && r.bottom > c.r.top,
        )
        .map((c) => `${el.getAttribute('aria-label')} under ${c.name}`);
    });
  }, selector);
  expect(covered).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test(`two children's island at ${viewport.width} × ${viewport.height}: avatars, badges, the Storehouse and the building that lost its plots`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await seedLocalChild(page, ADA, BEN);
    await seedLocalEvents(page, sharedIslandEvents);
    await openIsland(page, ADA.name);

    // The map: what both children built, and of the two on the same plots only the first.
    const scene = page.locator('[data-scene="island"]');
    for (const id of STANDING)
      await expect(scene.locator(`[data-building="${id}"]`)).toHaveCount(1);
    await expect(scene.locator(`[data-building="${DISPLACED}"]`)).toHaveCount(0);
    await expect(page.getByTestId('road-next')).toHaveAttribute(
      'data-stone',
      String(ROAD_LENGTH + 1),
    );

    // Both children stand on the island, whole on screen and under no control.
    const family = page.getByTestId('island-family');
    await expect(family.locator('[data-island-avatar]')).toHaveCount(2);
    await expect(family.getByRole('img', { name: ADA.name, exact: true })).toBeVisible();
    await expect(family.getByRole('img', { name: BEN.name, exact: true })).toBeVisible();
    await expectWhole(page, '[data-island-avatar], [data-built-by] [data-badge]');
    await expectUncovered(page, '[data-island-avatar]');
    // Who built what: one badge on a building, both children's on the shared project.
    const badges = (instance: string) => page.locator(`[data-built-by="${instance}"]`);
    await expect(badges('shell-cottage')).toHaveAttribute('data-children', ADA.id);
    await expect(badges('lantern-grove')).toHaveAttribute('data-children', BEN.id);
    await expect(badges('lighthouse')).toHaveAttribute('data-children', `${ADA.id} ${BEN.id}`);
    await expect(badges('lighthouse').locator('[data-badge]')).toHaveCount(2);
    await expect(badges('road-crew')).toHaveCount(0);

    // Ada's building lost its plots: she is told, in words she can read (06 §4: 24 px).
    const line = page.getByText('Someone was here first. Pick a new place to build!');
    await expect(line).toBeVisible();
    expect(
      await line.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(24);

    // The Storehouse is the family's; each pile is tagged by the children who made some of it.
    await page.getByRole('button', { name: 'Storehouse', exact: true }).click();
    const piles = page.getByTestId('storehouse-piles');
    await expect(piles.locator('li[data-material="stone"] [data-badge]')).toHaveCount(2);
    await expect(piles.locator('li[data-material="plank"] [data-badge]')).toHaveCount(1);
    await expect(piles.locator(`li[data-material="plank"] [data-badge="${BEN.id}"]`)).toBeVisible();
    await expectWhole(page, '[data-testid="storehouse-piles"] li');
    await page.keyboard.press('Escape');

    // She builds it again from the sheet, on a plot that is still free: this time it stands.
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const sheet = page.getByTestId('build-sheet');
    const card = sheet.locator(`[data-card="${DISPLACED}"]`);
    await expect(card).toHaveAttribute('data-state', 'ready');
    await card.getByRole('button', { name: 'Build it' }).click();
    await page.getByTestId('plot-targets').getByRole('button').first().click();
    await expect(page.getByTestId('construction')).toBeVisible();
    await page.getByRole('button', { name: 'Go on', exact: true }).click();
    await expect(scene.locator(`[data-building="${DISPLACED}"]`)).toHaveCount(1);
    await expect(badges(DISPLACED)).toHaveAttribute('data-children', ADA.id);

    // Told once, and the rebuilt building is still there: after a reload she is greeted as ever.
    await page.reload();
    await openIsland(page, ADA.name);
    await expect(page.getByText('Hello! Who do you want to help?')).toBeVisible();
    await expect(line).toHaveCount(0);
    await expect(scene.locator(`[data-building="${DISPLACED}"]`)).toHaveCount(1);
    for (const id of STANDING)
      await expect(scene.locator(`[data-building="${id}"]`)).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('the child whose building stood is not told anything', async ({ page }) => {
  await seedLocalChild(page, ADA, BEN);
  await seedLocalEvents(page, sharedIslandEvents);
  await openIsland(page, BEN.name);
  await expect(page.getByText('Hello! Who do you want to help?')).toBeVisible();
  await expect(page.locator('[data-island-avatar]')).toHaveCount(2);
});
