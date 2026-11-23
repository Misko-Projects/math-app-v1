import { expect, type Page, test } from '@playwright/test';
import { localEvents, seedLocalChild } from '../fixtures/localChild';

// #22 part 1, the island's core loop: a child lands on the island, sees the residents' requests,
// taps the recommended one, answers its first item in the Practice Pier, and comes home with what
// that made in the Storehouse and new requests on the island.
//
// The child is local to this browser (no pairing, no sync). A new kindergartner's recommended
// request starts with "what comes next" on the number chart (CNT.01), which this spec answers.
// Nothing here waits on, or asserts, elapsed real time.

const CHILD = { id: '019c0000-0000-7000-8000-00000000e2f1', name: 'Ada', grade: 'K' as const };

const types = async (page: Page) => (await localEvents(page)).map((e) => e.type);

test('the island loop: requests, one item at the pier, materials in the Storehouse, a new plan', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedLocalChild(page, CHILD);
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();

  const requests = page.getByTestId('requests').locator('[data-request]');
  await expect(requests.first()).toBeVisible();
  const offered = await requests.count();
  expect(offered).toBeGreaterThanOrEqual(2);
  expect(offered).toBeLessThanOrEqual(3);
  // The first request is the recommended one, and the only one.
  await expect(page.locator('[data-request][data-recommended="true"]')).toHaveCount(1);
  await expect(requests.first()).toHaveAttribute('data-recommended', 'true');
  // Each bubble says who asks and for what; its target is at least 64 px each way (06 §4).
  for (let i = 0; i < offered; i += 1) {
    await expect(requests.nth(i)).toHaveAccessibleName(/Can you help me make some things\? \S/);
    const box = await requests.nth(i).boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(64);
  }
  // The island does not scroll, and the Storehouse starts empty.
  const overflow = () =>
    page.evaluate(() => ({
      w: document.documentElement.scrollWidth - window.innerWidth,
      h: document.documentElement.scrollHeight - window.innerHeight,
    }));
  expect(await overflow()).toEqual({ w: 0, h: 0 });
  await expect(page.getByTestId('arrived')).toHaveCount(0);
  await page.getByRole('button', { name: 'Storehouse', exact: true }).click();
  await expect(page.getByText(/The Storehouse is empty/)).toBeVisible();
  await expect(page.getByTestId('storehouse-piles')).toHaveCount(0);
  await page.getByRole('button', { name: 'Go back' }).click();

  // Into the recommended request: its workshop opens on the first item.
  const first = await requests.first().getAttribute('data-request');
  const asked = (await requests.first().getAttribute('aria-label')) ?? '';
  await requests.first().click();
  const pier = page.getByTestId('pier');
  await expect(pier).toHaveAttribute('data-phase', 'answer');
  await expect(page).toHaveURL(/\/workshop\/practice-pier$/);
  const chart = page.getByTestId('pier-stage').locator('.ni-hc[data-mode="next"]');
  await expect(chart).toBeVisible();
  const start = Number(await chart.locator('[data-start="true"]').getAttribute('data-n'));
  await chart.locator(`[data-n="${start + 1}"]`).click();
  await page.getByTestId('pier-stage').getByRole('button', { name: 'Check' }).click();
  await expect(page.getByTestId('pier-cue')).toHaveAttribute('data-cue', 'right');
  await expect(pier).toHaveAttribute('data-phase', 'feedback');

  // Home, mid-request: the request is recorded with what it made so far.
  await page.getByRole('button', { name: 'Go home' }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();
  expect(await types(page)).toEqual([
    'session.started',
    'request.accepted',
    'attempt',
    'material.produced',
    'request.completed',
  ]);
  const events = await localEvents(page);
  const produced = events.find((e) => e.type === 'material.produced')?.payload as {
    requestId: string;
    materials: Record<string, number>;
  };
  expect(produced.requestId).toBe(first);
  const [material, count] = Object.entries(produced.materials)[0] as [string, number];
  expect(count).toBe(1);
  expect(asked).toContain(material === 'stone' ? 'road stones' : 'light');

  // What it made arrives beside the Storehouse, and is in it: one in a ten-frame (K).
  await expect(page.getByTestId('arrived')).toHaveAttribute('data-count', '1');
  await page.getByRole('button', { name: 'Storehouse', exact: true }).click();
  const pile = page.getByTestId('storehouse-piles').locator(`[data-material="${material}"]`);
  await expect(pile).toHaveAttribute('data-count', '1');
  await expect(pile.locator('[data-pile="ten-frame"]')).toHaveAttribute('data-filled', '1');
  await page.getByRole('button', { name: 'Go back' }).click();

  // The island planned again: new requests, none of them the one just played.
  await expect(requests.first()).toBeVisible();
  const again = await requests.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-request')),
  );
  expect(again).not.toContain(first);
  expect(await overflow()).toEqual({ w: 0, h: 0 });
  // The session is still running: nothing ended it.
  expect((await types(page)).includes('session.ended')).toBe(false);
  expect(errors).toEqual([]);
});
