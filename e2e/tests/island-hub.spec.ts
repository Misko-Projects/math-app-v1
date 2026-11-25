import { expect, type Page, test } from '@playwright/test';
import { localEvents, seedLocalChild } from '../fixtures/localChild';

// #22 part 1, the island's core loop: a child lands on the island, sees the residents' requests,
// taps the recommended one, answers its first item in the Practice Pier, and comes home with what
// that made in the Storehouse and new requests on the island.
//
// The child is local to this browser (no pairing, no sync). A new kindergartner's first request
// opens with the session's warmup (04 §6.1; part 4): the lesson of "what comes next" on the number
// chart (CNT.01), whose last step is the child's, and then its first item, which this spec answers.
//
// Time: the first test runs on Playwright's clock, and no line is spoken in real time (the audio
// manifest is not served): the lesson's demo is played out by running the clock. Nothing here
// waits on, or asserts, elapsed real time.

const CHILD = { id: '019c0000-0000-7000-8000-00000000e2f1', name: 'Ada', grade: 'K' as const };

/** The log's event types, without the steps of the lesson (one per demo step played). */
const types = async (page: Page) =>
  (await localEvents(page)).map((e) => e.type).filter((type) => type !== 'lesson.step');

/** Plays out what is playing (the lesson's demo) until the pier shows one of `phases`. */
async function until(page: Page, phases: RegExp): Promise<void> {
  const pier = page.getByTestId('pier');
  await expect(async () => {
    await page.clock.runFor(1000);
    await expect(pier).toHaveAttribute('data-phase', phases, { timeout: 250 });
  }).toPass();
}

test('the island loop: requests, one item at the pier, materials in the Storehouse, a new plan', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/audio/manifest.json', (route) => route.abort());
  await page.clock.install();
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

  // Into the recommended request: its workshop opens on the warmup, the skill's lesson.
  const first = await requests.first().getAttribute('data-request');
  const asked = (await requests.first().getAttribute('aria-label')) ?? '';
  await requests.first().click();
  const pier = page.getByTestId('pier');
  await expect(pier).toHaveAttribute('data-phase', /lesson|turn/);
  // "What comes next" on the number chart is Road Crew's (#27); it plays on the screen every
  // workshop shares. Left by Home before its parade, the request lays no road stone (below).
  await expect(page).toHaveURL(/\/workshop\/road-crew$/);
  const chart = page.getByTestId('pier-stage').locator('.ni-hc[data-mode="next"]');
  const check = page.getByTestId('pier-stage').getByRole('button', { name: 'Check' });
  /** Taps the number after the marked one and checks it, after a jump in time (06 §4). */
  const answerNext = async () => {
    await expect(chart).toBeVisible();
    const start = Number(await chart.locator('[data-start="true"]').getAttribute('data-n'));
    await chart.locator(`[data-n="${start + 1}"]`).click();
    await page.clock.fastForward(3000);
    await check.click();
    await expect(page.getByTestId('pier-cue')).toHaveAttribute('data-cue', 'right');
    await expect(pier).toHaveAttribute('data-phase', 'feedback');
  };
  // The demo shows the worked example, then the last step of the next one is the child's.
  await until(page, /turn/);
  await answerNext();
  expect(await types(page)).toEqual(['session.started', 'placement.completed', 'request.accepted']);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // The first item: answered right, it makes one of what the resident asked for.
  await until(page, /answer/);
  await answerNext();

  // Home, mid-request: the request is recorded with what it made so far.
  await page.getByRole('button', { name: 'Go home' }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();
  expect(await types(page)).toEqual([
    'session.started',
    'placement.completed',
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
  const pile = page.getByTestId('storehouse-piles').locator(`li[data-material="${material}"]`);
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

test('in portrait every request control keeps its whole target: nothing lies over a speaker', async ({
  page,
}) => {
  // A grade 2 child is offered three requests, the widest row the island shows.
  await page.setViewportSize({ width: 800, height: 1280 });
  await seedLocalChild(page, {
    id: '019c0000-0000-7000-8000-00000000e2f2',
    name: 'Ben',
    grade: '2',
  });
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: 'Ben', exact: true }).click();
  const cards = page.getByTestId('requests').getByRole('listitem');
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    for (const control of [
      cards.nth(i).locator('[data-request]'),
      cards.nth(i).getByRole('button', { name: 'Hear it again' }),
    ]) {
      const box = await control.boundingBox();
      if (!box) throw new Error('a request control is not on screen');
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(64);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(800);
    }
  }
  // The speaker is round: it is hit at the middle of each edge and at its centre, so the parent
  // gate, its hint, the next card and the bubble's own button are not on top of it.
  const speakersWhole = async () => {
    for (let i = 0; i < 3; i += 1) {
      const speaker = cards.nth(i).getByRole('button', { name: 'Hear it again' });
      const hits = await speaker.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const points = [
          [r.left + 6, cy],
          [r.right - 6, cy],
          [cx, r.top + 6],
          [cx, r.bottom - 6],
          [cx, cy],
        ];
        return points.map(([x, y]) =>
          el.contains(document.elementFromPoint(x as number, y as number)),
        );
      });
      expect(hits, `speaker ${i}`).toEqual([true, true, true, true, true]);
    }
  };
  await speakersWhole();
  // A short press on the parent gate opens its hint over this corner: the speakers stay whole.
  await page.getByRole('button', { name: /^Grown-ups/ }).click();
  await expect(page.locator('#parent-gate-hint')).toBeVisible();
  await speakersWhole();
  await expect(page.locator('#parent-gate-hint')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      w: document.documentElement.scrollWidth - window.innerWidth,
      h: document.documentElement.scrollHeight - window.innerHeight,
    })),
  ).toEqual({ w: 0, h: 0 });
});
