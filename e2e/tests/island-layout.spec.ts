import { expect, type Page, test } from '@playwright/test';
import { seedLocalChild, seedLocalEvents } from '../fixtures/localChild';
import { ADA, BEN, DISPLACED, STANDING, sharedIslandEvents } from '../fixtures/sharedIsland';

// #22 part 4, the island's layout (06 §1: 960 × 600 is the smallest screen, 1280 × 800 the
// tablet): once the island has grown past the sandbar, the request row and the guide's line with
// its speaker cover no building, no badge, no road stone and no plot offered for a new building.
// The land is drawn in the room the controls leave.
//
// The island is the seeded one of two children (ring 1: four buildings, five stones, badges);
// Ben, in grade 2, is offered three requests, the widest row. Nothing here waits on elapsed time.

const VIEWPORTS = [
  { width: 960, height: 600 },
  { width: 1280, height: 800 },
];

const COVERS = '[data-testid="requests"] > li, [data-testid="island-line"] > *';
const ON_THE_MAP = [
  '[data-scene="island"] [data-building]',
  '[data-built-by] [data-badge]',
  '[data-scene="island"] [data-stone]',
].join(', ');

/** What of `things` lies under one of `covers` or reaches off screen, as readable names. */
async function hidden(page: Page, things: string, covers: string): Promise<string[]> {
  return page.evaluate(
    ([thingSel, coverSel]) => {
      const name = (el: Element) =>
        el.getAttribute('data-building') ??
        el.getAttribute('data-badge') ??
        el.getAttribute('data-stone') ??
        el.getAttribute('data-plot') ??
        el.getAttribute('aria-label') ??
        el.tagName;
      const over = Array.from(document.querySelectorAll(coverSel as string)).map((el) => ({
        name: el.textContent?.trim().slice(0, 24) || name(el),
        r: el.getBoundingClientRect(),
      }));
      return Array.from(document.querySelectorAll(thingSel as string)).flatMap((el) => {
        const r = el.getBoundingClientRect();
        const out: string[] = [];
        if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
          out.push(`${name(el)} off screen`);
        for (const c of over)
          if (r.left < c.r.right && r.right > c.r.left && r.top < c.r.bottom && r.bottom > c.r.top)
            out.push(`${name(el)} under ${c.name}`);
        return out;
      });
    },
    [things, covers],
  );
}

for (const viewport of VIEWPORTS) {
  test(`the island at ${viewport.width} × ${viewport.height}: three requests and the guide's line cover nothing on the map`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await seedLocalChild(page, ADA, BEN);
    await seedLocalEvents(page, sharedIslandEvents);
    await page.getByTestId('tap-to-start').click();
    await page.getByRole('button', { name: BEN.name, exact: true }).click();
    await expect(page.getByTestId('child-home')).toBeVisible();

    const cards = page.getByTestId('requests').getByRole('listitem');
    await expect(cards).toHaveCount(3);
    await expect(page.getByTestId('island-line').getByText(/\S/).first()).toBeVisible();
    const scene = page.locator('[data-scene="island"]');
    for (const id of STANDING)
      await expect(scene.locator(`[data-building="${id}"]`)).toHaveCount(1);
    await expect(page.locator('[data-built-by] [data-badge]')).toHaveCount(5);
    expect(await scene.locator('[data-stone]').count()).toBeGreaterThanOrEqual(5);

    // The map is whole, and under no request and no line of the guide.
    await expect.poll(() => hidden(page, ON_THE_MAP, COVERS)).toEqual([]);
    // The requests keep their whole targets, on screen, beside the avatars and the parent gate.
    expect(
      await hidden(page, '[data-testid="requests"] button', '[data-island-avatar], footer button'),
    ).toEqual([]);
    expect(
      await page.evaluate(() => ({
        w: document.documentElement.scrollWidth - innerWidth,
        h: document.documentElement.scrollHeight - innerHeight,
      })),
    ).toEqual({ w: 0, h: 0 });

    // A request with many pictures is taller than the row's usual place (two rows of them):
    // the map makes room for the cards as tall as they are.
    const lighthouse = scene.locator('[data-building="lighthouse"]');
    const usual = await lighthouse.boundingBox();
    await cards.first().evaluate((card) => {
      (card as HTMLElement).style.paddingTop = '70px';
    });
    await expect
      .poll(async () => (await cards.first().boundingBox())?.height ?? 0)
      .toBeGreaterThan(270);
    await expect.poll(() => hidden(page, ON_THE_MAP, COVERS)).toEqual([]);
    // The map was drawn smaller for it, and is as it was once the card is its usual height.
    expect((await lighthouse.boundingBox())?.height).toBeLessThan(usual?.height ?? 0);
    await cards.first().evaluate((card) => {
      (card as HTMLElement).style.paddingTop = '';
    });
    await expect.poll(() => lighthouse.boundingBox()).toEqual(usual);
    expect(await hidden(page, ON_THE_MAP, COVERS)).toEqual([]);

    // A new building: the plots offered for it are under no line of the guide either, and the
    // map has not moved (the requests step aside, their place is kept).
    const before = await lighthouse.boundingBox();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const card = page.getByTestId('build-sheet').locator(`[data-card="${DISPLACED}"]`);
    await card.getByRole('button', { name: 'Build it' }).click();
    const targets = page.getByTestId('plot-targets').getByRole('button');
    await expect(targets.first()).toBeVisible();
    await expect(cards).toHaveCount(0);
    // However small the map is drawn, a plot's target is at least 64 px each way, and the
    // targets keep 12 px between them (06 §4): the drawn marker is only its picture.
    const boxes = await targets.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.right - b.left).toBeGreaterThanOrEqual(64);
      expect(b.bottom - b.top).toBeGreaterThanOrEqual(64);
    }
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) {
        const gap = Math.max(
          Math.max(a.left, b.left) - Math.min(a.right, b.right),
          Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom),
        );
        expect(gap).toBeGreaterThanOrEqual(12);
      }
    await expect
      .poll(() => hidden(page, '[data-testid="plot-targets"] button', COVERS))
      .toEqual([]);
    expect(await hidden(page, ON_THE_MAP, COVERS)).toEqual([]);
    expect(await lighthouse.boundingBox()).toEqual(before);
    expect(errors).toEqual([]);
  });
}
