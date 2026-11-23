import { expect, type Page, test } from '@playwright/test';
import { localEvents, seedLocalChild, seedLocalEvents } from '../fixtures/localChild';

// #22 part 2, building on the island: with materials in the Storehouse a child opens the build
// sheet, sees what each recipe needs, builds the first home on a highlighted plot, watches (and
// skips) the construction step, and lays the next stones of the Numbered Road, which counts on
// to each new stone.
//
// The child and the materials are local to this browser (no pairing, no sync). Nothing here
// waits on, or asserts, elapsed real time: a step is over when its effect is on screen.

const CHILD = { id: '019c0000-0000-7000-8000-00000000e2b2', name: 'Ada', grade: 'K' as const };

const produced = (materials: Record<string, number>) => ({
  type: 'material.produced',
  childId: CHILD.id,
  payload: { sessionId: 'seed', requestId: 'seed', workshopId: 'practice-pier', materials },
});

const types = async (page: Page) => (await localEvents(page)).map((e) => e.type);
const overflow = (page: Page) =>
  page.evaluate(() => ({
    w: document.documentElement.scrollWidth - window.innerWidth,
    h: document.documentElement.scrollHeight - window.innerHeight,
  }));

async function openIsland(page: Page, materials: Record<string, number>) {
  await seedLocalChild(page, CHILD);
  await seedLocalEvents(page, [produced(materials)]);
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();
  await expect(page.getByTestId('requests').locator('[data-request]').first()).toBeVisible();
}

/** Every card and control of the open sheet is whole on screen, and the sheet does not scroll. */
async function expectSheetFits(page: Page) {
  const sheet = page.getByTestId('build-sheet');
  await expect(sheet).toBeVisible();
  const fits = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) return { scrolls: true, outside: ['no dialog'] };
    const scrolls = [dialog, ...Array.from(dialog.querySelectorAll('*'))].some(
      (el) => el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible',
    );
    const outside = Array.from(dialog.querySelectorAll('[data-card], button'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight;
      })
      .map((el) => el.getAttribute('data-card') ?? el.getAttribute('aria-label') ?? el.tagName);
    return { scrolls, outside };
  });
  expect(fits).toEqual({ scrolls: false, outside: [] });
  for (const button of await sheet.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(64);
  }
}

test('build the first home: the recipe, a highlighted plot, the construction step', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openIsland(page, { stone: 7, light: 3 });
  expect(await overflow(page)).toEqual({ w: 0, h: 0 });

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const sheet = page.getByTestId('build-sheet');
  // What can be bought comes first: the first home, paid in full (no unit missing).
  const cottage = sheet.locator('[data-card="shell-cottage"]');
  await expect(cottage).toHaveAttribute('data-state', 'ready');
  await expect(cottage.locator('li[data-material="stone"]')).toHaveAttribute('data-missing', '0');
  await expect(cottage.locator('[data-unit="missing"]')).toHaveCount(0);
  await expect(cottage.locator('li[data-material="stone"] [data-unit="have"]')).toHaveCount(5);
  // Every page fits the screen without scrolling, and a locked card shows no way to build.
  const pages = Number(await sheet.getAttribute('data-pages'));
  expect(pages).toBeGreaterThan(1);
  await expectSheetFits(page);
  for (let p = 1; p < pages; p += 1) {
    await page.getByTestId('build-next').click();
    await expect(sheet).toHaveAttribute('data-page', String(p));
    await expectSheetFits(page);
  }
  await expect(sheet.locator('[data-state="locked"]').first()).toBeVisible();
  await expect(
    sheet.locator('[data-state="locked"]').getByRole('button', { name: 'Build it' }),
  ).toHaveCount(0);
  for (let p = pages - 1; p > 0; p -= 1) await page.getByTestId('build-prev').click();

  // Build it: the sheet closes and the island offers the sandbar's free plot.
  await cottage.getByRole('button', { name: 'Build it' }).click();
  const plots = page.getByTestId('plot-targets').getByRole('button');
  await expect(plots).toHaveCount(1);
  await expect(page.getByTestId('requests')).toHaveCount(0);
  const plot = await plots.first().boundingBox();
  expect(Math.min(plot?.width ?? 0, plot?.height ?? 0)).toBeGreaterThanOrEqual(64);
  // The target lies on the plot the scene highlights.
  const marker = await page.locator('[data-plot-marker]').first().boundingBox();
  const centre = {
    x: (plot?.x ?? 0) + (plot?.width ?? 0) / 2,
    y: (plot?.y ?? 0) + (plot?.height ?? 0) / 2,
  };
  expect(centre.x).toBeGreaterThan(marker?.x ?? 0);
  expect(centre.x).toBeLessThan((marker?.x ?? 0) + (marker?.width ?? 0));
  expect(centre.y).toBeGreaterThan(marker?.y ?? 0);
  expect(centre.y).toBeLessThan((marker?.y ?? 0) + (marker?.height ?? 0));
  await plots.first().click();

  // The construction step, skipped; the home stands and the requests are back.
  await expect(page.getByTestId('construction')).toBeVisible();
  await page.getByRole('button', { name: 'Go on', exact: true }).click();
  await expect(page.getByTestId('construction')).toHaveCount(0);
  await expect(page.locator('[data-building="shell-cottage"][data-stage="1"]')).toBeVisible();
  await expect(page.getByTestId('requests').locator('[data-request]').first()).toBeVisible();
  expect((await types(page)).slice(1)).toEqual(
    expect.arrayContaining(['building.placed', 'material.spent', 'resident.arrived']),
  );
  const spent = (await localEvents(page)).find((e) => e.type === 'material.spent');
  expect(spent?.payload).toEqual({
    materials: { stone: 5, light: 3 },
    purpose: { kind: 'build', ref: 'shell-cottage' },
  });
  expect(await overflow(page)).toEqual({ w: 0, h: 0 });

  // The Storehouse holds what is left: two stones.
  await page.getByRole('button', { name: 'Storehouse', exact: true }).click();
  await expect(
    page.locator('[data-testid="storehouse-piles"] li[data-material="stone"]'),
  ).toHaveAttribute('data-count', '2');
  await page.getByRole('button', { name: 'Go back' }).click();
  // The home is at level 1: the sheet now offers its next level, which is short.
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  // (The free workshops, which now have room, come first: page to the home's card.)
  await expect(sheet).toBeVisible();
  while ((await sheet.locator('[data-card="shell-cottage"]').count()) === 0)
    await page.getByTestId('build-next').click();
  await expect(sheet.locator('[data-card="shell-cottage"]')).toHaveAttribute('data-level', '2');
  await expect(sheet.locator('[data-card="shell-cottage"]')).toHaveAttribute('data-state', 'short');
  expect(errors).toEqual([]);
});

test('the Numbered Road: lay the next stones and count on to each', async ({ page }) => {
  await openIsland(page, { stone: 2 });
  const next = page.getByTestId('road-next');
  await expect(next).toHaveAttribute('data-stone', '1');
  await expect(next).toHaveAttribute('data-affordable', 'true');
  // The stone's own target on the map, at least 80 px across (06 §4).
  const hit = page.locator('[data-hit="next"]');
  const box = await hit.boundingBox();
  expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(80);
  await hit.click();
  await expect(next).toHaveAttribute('data-stone', '2');
  await expect(
    page.locator('[data-stone="1"][data-state="laid"], [data-stone="1"][data-state="counting"]'),
  ).toHaveCount(1);
  // The button lays the second one; the walk ends with no stone counted.
  await next.click();
  await expect(next).toHaveAttribute('data-stone', '3');
  await expect(next).toHaveAttribute('data-affordable', 'false');
  await expect(page.locator('[data-state="counting"]')).toHaveCount(0);
  const log = await localEvents(page);
  expect(log.filter((e) => e.type === 'road.extended').map((e) => e.payload)).toEqual([
    { to: 1 },
    { to: 2 },
  ]);
  // No stone left: asking again writes nothing.
  await next.click();
  await expect(next).toHaveAttribute('data-stone', '3');
  expect((await localEvents(page)).length).toBe(log.length);
  expect(await overflow(page)).toEqual({ w: 0, h: 0 });
});

test('the build sheet fits a 960 × 600 screen', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await openIsland(page, { stone: 7, light: 3 });
  expect(await overflow(page)).toEqual({ w: 0, h: 0 });
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const sheet = page.getByTestId('build-sheet');
  const pages = Number(await sheet.getAttribute('data-pages'));
  await expectSheetFits(page);
  for (let p = 1; p < pages; p += 1) {
    await page.getByTestId('build-next').click();
    await expect(sheet).toHaveAttribute('data-page', String(p));
    await expectSheetFits(page);
  }
});

test('while a plot is chosen, every tap reaches the control under it (960 × 600)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await seedLocalChild(page, CHILD);
  // The first home stands and the road reaches 100: the island is large, and its southern plots
  // lie where the way back is shown.
  await seedLocalEvents(page, [
    {
      type: 'building.placed',
      childId: CHILD.id,
      payload: { instanceId: 'shell-cottage', buildingId: 'shell-cottage', plot: [3, 4] },
    },
    {
      type: 'resident.arrived',
      childId: CHILD.id,
      payload: { residentId: 'hobb', homeInstanceId: 'shell-cottage', via: 'home' },
    },
    { type: 'road.extended', childId: CHILD.id, payload: { to: 100 } },
  ]);
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await expect(page.getByTestId('requests').locator('[data-request]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const sheet = page.getByTestId('build-sheet');
  await expect(sheet).toBeVisible();
  while ((await sheet.locator('[data-card="road-crew"]').count()) === 0)
    await page.getByTestId('build-next').click();
  await sheet.locator('[data-card="road-crew"]').getByRole('button', { name: 'Build it' }).click();
  const plots = page.getByTestId('plot-targets').getByRole('button');
  await expect(plots.first()).toBeVisible();
  expect(await plots.count()).toBeGreaterThan(3);
  // The middle of every offered plot belongs to that plot's own button, and the other controls
  // of the screen (the guide's replay, the way back, Home) to themselves.
  const hits = await page.evaluate(() => {
    const top = (el: Element) => {
      const r = el.getBoundingClientRect();
      return document
        .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        ?.closest('button');
    };
    const wrong: string[] = [];
    for (const b of Array.from(document.querySelectorAll('[data-testid="plot-targets"] button')))
      if (top(b) !== b) wrong.push(`plot ${b.getAttribute('data-plot')}`);
    for (const b of Array.from(document.querySelectorAll('[data-testid="child-home"] button')))
      if (
        !b.closest('[data-testid="plot-targets"]') &&
        !(b as HTMLButtonElement).disabled &&
        top(b) !== b
      )
        wrong.push(b.getAttribute('aria-label') ?? b.textContent ?? 'button');
    return wrong;
  });
  expect(hits).toEqual([]);
  // The guide's line can be heard again, and the way back works.
  await page.getByRole('button', { name: 'Hear it again' }).first().click({ trial: true });
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByTestId('plot-targets')).toHaveCount(0);
  expect((await localEvents(page)).filter((e) => e.type === 'building.placed')).toHaveLength(1);
});

test('a plot under the way back is not offered (960 × 680, a 1 × 1 home, the road at 100)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 680 });
  await seedLocalChild(page, CHILD);
  await seedLocalEvents(page, [
    produced({ plank: 6, stone: 4 }),
    {
      type: 'building.placed',
      childId: CHILD.id,
      payload: { instanceId: 'shell-cottage', buildingId: 'shell-cottage', plot: [3, 4] },
    },
    {
      type: 'resident.arrived',
      childId: CHILD.id,
      payload: { residentId: 'hobb', homeInstanceId: 'shell-cottage', via: 'home' },
    },
    {
      type: 'building.placed',
      childId: CHILD.id,
      payload: { instanceId: 'ten-boat-dock', buildingId: 'ten-boat-dock', plot: [1, 2] },
    },
    { type: 'road.extended', childId: CHILD.id, payload: { to: 100 } },
  ]);
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await expect(page.getByTestId('requests').locator('[data-request]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const sheet = page.getByTestId('build-sheet');
  await expect(sheet).toBeVisible();
  while ((await sheet.locator('[data-card="driftwood-hut"]').count()) === 0)
    await page.getByTestId('build-next').click();
  await sheet
    .locator('[data-card="driftwood-hut"]')
    .getByRole('button', { name: 'Build it' })
    .click();
  // The build sheet is closed and the way back is on screen before anything is measured.
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const back = page.getByRole('button', { name: 'Go back' });
  await expect(back).toBeVisible();
  const plots = page.getByTestId('plot-targets').getByRole('button');
  await expect(plots.first()).toBeVisible();
  expect(await plots.count()).toBeGreaterThan(6);
  const wrong = await page.evaluate(() => {
    const out: string[] = [];
    const all = Array.from(document.querySelectorAll('[data-testid="child-home"] button'));
    for (const b of all) {
      if ((b as HTMLButtonElement).disabled) continue;
      const r = b.getBoundingClientRect();
      const hit = document
        .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        ?.closest('button');
      if (hit !== b) out.push(b.getAttribute('data-plot') ?? b.getAttribute('aria-label') ?? '?');
    }
    return out;
  });
  expect(wrong).toEqual([]);
  // The way back still calls the placement off, and nothing was built.
  await back.click();
  await expect(page.getByTestId('plot-targets')).toHaveCount(0);
  expect((await localEvents(page)).filter((e) => e.type === 'building.placed')).toHaveLength(2);
});
