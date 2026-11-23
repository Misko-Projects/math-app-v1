import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  type LocalEvent,
  localEvents,
  seedLocalChild,
  seedLocalEvents,
} from '../fixtures/localChild';

// Golden journey 4 (09 §3), the returning session: pick the profile → the first math interaction
// → three requests played to their end → build → wind-down at the budget.
//
// - "Three different workshops": only the Practice Pier is registered so far, and it hosts every
//   request (02 §5.6), so the three requests are the island's own, one after another, each for
//   the material its resident asked for. Q01 plays this journey again with themed workshops.
// - "The first math interaction within 10 s (measured)": that time is measured on an injected
//   clock, from the tap on a request to the mount of its first widget, in
//   `apps/web/src/island/ChildHomePage.test.tsx`. Here the journey checks what is measured: one
//   tap on the recommended request and a widget takes the child's answer, with no screen between.
// - The child is local to this browser (no pairing, no sync), with a Storehouse from earlier
//   sessions, so the first home can be built. Every item is answered in its real widget.
//
// Time: the page runs on Playwright's clock, and no line is spoken in real time (the audio
// manifest is not served). Nothing here waits on, or asserts, elapsed real time.

const CHILD = { id: '019c0000-0000-7000-8000-00000000e4a1', name: 'Ada', grade: 'K' as const };
const STOREHOUSE = { stone: 5, light: 3 };
const K_BUDGET_MS = 10 * 60_000;

type Screen = 'home' | 'summary' | 'feedback' | 'turn' | 'answer';

/** Plays out what is playing (a lesson's demo, a spoken line) until a screen waits for the child. */
async function waiting(page: Page): Promise<Screen> {
  let screen: Screen | null = null;
  await expect(async () => {
    screen = await page.evaluate(() => {
      if (document.querySelector('[data-testid="child-home"]')) return 'home';
      if (document.querySelector('[data-testid="pier-summary"]')) return 'summary';
      const phase = document.querySelector('[data-testid="pier"]')?.getAttribute('data-phase');
      return phase === 'feedback' || phase === 'turn' || phase === 'answer' ? phase : null;
    });
    if (screen === null) {
      await page.clock.runFor(1000);
      throw new Error('still playing');
    }
  }).toPass();
  return screen as unknown as Screen;
}

/** How this journey answers each format it meets, in the real widget, right. */
const ANSWER: Record<string, (stage: Locator) => Promise<void>> = {
  // "What comes next?" on the number chart: the cell after the marked one, or, where the chart
  // is small and the answer is typed (a short screen), its digits on the number pad.
  'hundred-chart': async (stage) => {
    const chart = stage.locator('.ni-hc[data-mode="next"]');
    const start = Number(await chart.locator('[data-start="true"]').getAttribute('data-n'));
    const pad = stage.locator('.ni-pad');
    if ((await pad.count()) === 0) await chart.locator(`[data-n="${start + 1}"]`).click();
    else
      for (const digit of String(start + 1))
        await pad.locator(`.ni-pad__key[aria-label="${digit}"]`).click();
  },
  // Number cards into their boxes, in the order the cue shows.
  order: async (stage) => {
    const board = stage.locator('.ni-ord');
    const down = (await board.getAttribute('data-direction')) === 'desc';
    const numbers = (
      await board
        .locator('.ni-ord__tray [data-place-item]')
        .evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('aria-label'))))
    ).sort((a, b) => (down ? b - a : a - b));
    for (const [i, n] of numbers.entries()) {
      await board.locator(`.ni-ord__tray [data-place-item][aria-label="${n}"]`).first().click();
      await board.locator(`[data-place-target="slot-${i}"]`).click();
    }
  },
  // Count every object, then pick how many.
  'tap-count': async (stage) => {
    const things = stage.getByRole('group', { name: 'Look at the picture' }).getByRole('button');
    const count = await things.count();
    for (let i = 0; i < count; i += 1) await things.nth(i).click();
    await stage.getByRole('button', { name: String(count), exact: true }).click();
  },
};

/** Plays the request on screen to its end and back to the island; returns the formats it met. */
async function playRequest(page: Page): Promise<string[]> {
  const stage = page.getByTestId('pier-stage');
  const formats: string[] = [];
  for (;;) {
    const screen = await waiting(page);
    if (screen === 'home') return formats;
    if (screen === 'summary') {
      // The request is over: "Okay" writes it and goes back to the island.
      await page.getByRole('button', { name: 'Okay!' }).click();
      await expect(page.getByTestId('child-home')).toBeVisible();
      return formats;
    }
    if (screen === 'feedback') {
      await expect(page.getByTestId('pier-cue')).toHaveAttribute('data-cue', 'right');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    } else {
      const format = (await stage.locator('.ni-widget').getAttribute('data-format')) ?? '';
      const answer = ANSWER[format];
      if (!answer)
        throw new Error(`journey 4 cannot answer the "${format}" format yet: add it to ANSWER`);
      formats.push(format);
      await answer(stage);
      // Never a "rapid tap" (04 §6.4), and past the widget's check debounce (06 §4).
      await page.clock.fastForward(3000);
      await stage.getByRole('button', { name: 'Check' }).click();
    }
  }
}

const of = (events: LocalEvent[], type: string) => events.filter((e) => e.type === type);

test('golden journey 4: a returning child plays three requests, builds, and the day winds down', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/audio/manifest.json', (route) => route.abort());
  await page.clock.install();
  await seedLocalChild(page, CHILD);
  await seedLocalEvents(page, [
    {
      type: 'material.produced',
      childId: CHILD.id,
      payload: {
        sessionId: 'an-earlier-session',
        requestId: 'an-earlier-request',
        workshopId: 'practice-pier',
        materials: STOREHOUSE,
      },
    },
  ]);

  await test.step('pick the profile: the island, with a recommended request', async () => {
    await page.getByTestId('tap-to-start').click();
    await page.getByRole('button', { name: CHILD.name, exact: true }).click();
    await expect(page.getByTestId('child-home')).toBeVisible();
    await expect(page.locator('[data-request][data-recommended="true"]')).toHaveCount(1);
  });

  const scene = page.locator('[data-scene="island"]');
  const requests = page.getByTestId('requests').locator('[data-request]');
  const played: string[] = [];

  await test.step('the first math interaction: one tap, and a widget takes the answer', async () => {
    const first = await requests.first().getAttribute('data-request');
    await requests.first().click();
    await expect(page).toHaveURL(/\/workshop\/practice-pier$/);
    await expect(page.getByTestId('pier')).toBeVisible();
    // The session's warmup comes first (04 §6.1): for a child who has answered nothing yet it is
    // the lesson of the first skill, whose demo plays by itself up to the child's turn.
    expect(await waiting(page)).toBe('turn');
    await expect(page.getByTestId('pier-stage').locator('.ni-widget')).toHaveAttribute(
      'data-registered',
      'true',
    );
    const accepted = of(await localEvents(page), 'request.accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.payload.requestId).toBe(first);
    expect(of(await localEvents(page), 'lesson.step').length).toBeGreaterThan(0);
    played.push(first as string);
  });

  await test.step('three requests, each played to its end and paid in the material asked for', async () => {
    for (let n = 1; n <= 3; n += 1) {
      if (n > 1) {
        await expect(requests.first()).toBeVisible();
        const id = (await requests.first().getAttribute('data-request')) as string;
        expect(played).not.toContain(id);
        played.push(id);
        await requests.first().click();
        await expect(page.getByTestId('pier')).toBeVisible();
      }
      const formats = await playRequest(page);
      expect(formats.length, `request ${n} had items to answer`).toBeGreaterThan(0);
      await expect(page.getByTestId('child-home')).toBeVisible();
      const events = await localEvents(page);
      const completed = of(events, 'request.completed');
      expect(completed).toHaveLength(n);
      expect(completed.at(-1)?.payload).toMatchObject({
        requestId: played[n - 1],
        endedEarly: false,
      });
      expect(completed.at(-1)?.payload.items).toBe(completed.at(-1)?.payload.firstTryCorrect);
      // What it made is beside the Storehouse, and in it.
      const produced = of(events, 'material.produced').at(-1)?.payload as {
        requestId: string;
        materials: Record<string, number>;
      };
      expect(produced.requestId).toBe(played[n - 1]);
      const units = Object.values(produced.materials).reduce((sum, k) => sum + k, 0);
      expect(units).toBeGreaterThan(0);
      await expect(page.getByTestId('arrived')).toHaveAttribute('data-count', String(units));
    }
    const events = await localEvents(page);
    expect(of(events, 'request.accepted')).toHaveLength(3);
    const attempts = of(events, 'attempt');
    expect(attempts.length).toBeGreaterThanOrEqual(3);
    expect(attempts.every((a) => a.payload.correct === true)).toBe(true);
    // The warmup was the first request's alone.
    expect(new Set(played).size).toBe(3);
  });

  await test.step('build: the first home, on a highlighted plot', async () => {
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const card = page.getByTestId('build-sheet').locator('[data-card="shell-cottage"]');
    await expect(card).toHaveAttribute('data-state', 'ready');
    await card.getByRole('button', { name: 'Build it' }).click();
    await page.getByTestId('plot-targets').getByRole('button').first().click();
    await expect(page.getByTestId('construction')).toBeVisible();
    await page.getByRole('button', { name: 'Go on', exact: true }).click();
    await expect(scene.locator('[data-building="shell-cottage"]')).toHaveCount(1);
    await expect(requests.first()).toBeVisible();
  });

  await test.step('decorate: a piece from the tray onto the island', async () => {
    await page.getByRole('button', { name: 'Decorate', exact: true }).click();
    const tray = page.getByTestId('decor-tray');
    await expect(tray).toBeVisible();
    await expect(requests).toHaveCount(0);
    // The parent gate stays a grown-up's way in while the child decorates: nothing lies over it.
    const gateOnTop = await page.getByRole('button', { name: /^Grown-ups/ }).evaluate((gate) => {
      const r = gate.getBoundingClientRect();
      return gate.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });
    expect(gateOnTop).toBe(true);
    await tray.locator('[data-state="spare"]').first().click();
    await page.getByTestId('plot-targets').getByRole('button').first().click();
    await expect(scene.locator('[data-decor-instance]')).toHaveCount(1);
    await expect(tray.locator('[data-state="placed"]')).toHaveCount(1);
    await tray.getByRole('button', { name: 'Okay!' }).click();
    await expect(requests.first()).toBeVisible();
    expect(of(await localEvents(page), 'decor.placed')).toHaveLength(1);
  });

  await test.step('wind-down at the budget: the sunset recaps the day, then the picker', async () => {
    expect(of(await localEvents(page), 'session.ended')).toHaveLength(0);
    await page.clock.fastForward(K_BUDGET_MS);
    await expect(page.getByTestId('sunset')).toBeVisible();
    // What was made today (not the Storehouse from before) and what was built.
    const today = of(await localEvents(page), 'material.produced')
      .slice(1)
      .flatMap((e) => Object.entries(e.payload.materials as Record<string, number>));
    const recap = page.getByTestId('recap');
    for (const material of new Set(today.map(([id]) => id))) {
      const count = today.filter(([id]) => id === material).reduce((sum, [, k]) => sum + k, 0);
      await expect(recap.locator(`li[data-material="${material}"]`)).toHaveAttribute(
        'data-count',
        String(count),
      );
    }
    await expect(recap.locator('[data-built="shell-cottage"]')).toBeVisible();
    await expect(page.getByText('Great playing! See you next time!')).toBeVisible();
    expect(
      await page.evaluate(() => ({
        w: document.documentElement.scrollWidth - innerWidth,
        h: document.documentElement.scrollHeight - innerHeight,
      })),
    ).toEqual({ w: 0, h: 0 });
    const ended = of(await localEvents(page), 'session.ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.payload).toMatchObject({ reason: 'wind-down' });
    await page.getByRole('button', { name: 'Okay!' }).click();
    await expect(page.getByRole('button', { name: CHILD.name, exact: true })).toBeVisible();
    await expect(page.getByTestId('sunset')).toHaveCount(0);
  });

  expect(errors).toEqual([]);
});
