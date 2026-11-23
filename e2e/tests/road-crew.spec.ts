import { expect, type Locator, test } from '@playwright/test';
import { type LocalEvent, localEvents, seedLocalChild } from '../fixtures/localChild';
import { ANSWER, waiting } from '../fixtures/workshopPlay';

// #27, Road Crew (W1): a child picks a request on the island and plays it to its end in the Road
// Crew workshop, with one wrong answer on the way. Every right answer makes a stone, which shows
// in the row of stones, up to the request's reward (the warmup's item comes on top of it and
// makes none once the reward is dealt); a wrong one makes none. At the end the stones parade, one of them
// goes onto the road with its number (`road.extended`, paid with one stone), and back on the
// island the road is one stone longer and the others are in the Storehouse.
//
// The child is local to this browser (no pairing, no sync) and new: the first request opens with
// the session's warmup, the lesson of the first skill, which plays in the workshop too.
//
// Time: the page runs on Playwright's clock, and no line is spoken in real time (the audio
// manifest is not served). Nothing here waits on, or asserts, elapsed real time.

const CHILD = { id: '019c0000-0000-7000-8000-00000000e271', name: 'Ada', grade: 'K' as const };

/** A wrong answer in the real widget, for the formats this spec may answer wrong. */
const WRONG: Record<string, (stage: Locator) => Promise<void>> = {
  // Two after the marked number is not what comes next.
  'hundred-chart': async (stage) => {
    const chart = stage.locator('.ni-hc[data-mode="next"]');
    const start = Number(await chart.locator('[data-start="true"]').getAttribute('data-n'));
    await chart.locator(`[data-n="${start + 2}"]`).click();
  },
  // Nothing to count is never the answer.
  'tap-count': async (stage) => {
    await stage.getByRole('button', { name: '0', exact: true }).click();
  },
};

const of = (events: LocalEvent[], type: string) => events.filter((e) => e.type === type);

test('a child plays a Road Crew request with a wrong answer: stones, the parade, a longer road', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/audio/manifest.json', (route) => route.abort());
  await page.clock.install();
  await seedLocalChild(page, CHILD);
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();
  await expect(page.locator('[data-layer="road"]')).toHaveAttribute('data-road-length', '0');

  // The recommended request of a new kindergartner counts on the number chart: Road Crew's.
  const requests = page.getByTestId('requests').locator('[data-request]');
  const picked = await requests.first().getAttribute('data-request');
  await requests.first().click();
  await expect(page).toHaveURL(/\/workshop\/road-crew$/);
  const pier = page.getByTestId('pier');
  await expect(pier).toHaveAttribute('data-workshop', 'road-crew');

  const stage = page.getByTestId('pier-stage');
  const cue = page.getByTestId('pier-cue');
  const tray = page.getByTestId('road-crew-tray');
  const made = async () => Number(await tray.getAttribute('data-made'));
  const check = async () => {
    // Never a "rapid tap" (04 §6.4), and past the widget's check debounce (06 §4).
    await page.clock.fastForward(3000);
    await stage.getByRole('button', { name: 'Check' }).click();
  };
  const formats: string[] = [];
  let lessonInWorld = false;
  let wrong: string | null = null;
  let stones = 0;
  let right = 0;
  /** The request's reward is dealt: a right answer after that makes no stone. */
  let dealt = false;
  /** After a right answer: one more stone in the row, until the reward is dealt. */
  const rightAnswer = async () => {
    await expect(cue).toHaveAttribute('data-cue', 'right');
    right += 1;
    const now = await made();
    if (!dealt && now === stones + 1) stones = now;
    else {
      dealt = true;
      expect(now).toBe(stones);
    }
    await expect(tray).toHaveAccessibleName(`Your stones: ${stones}`);
  };

  await test.step('the request, task by task: the lesson in-world, a wrong answer, stones for right ones', async () => {
    for (;;) {
      const screen = await waiting(page);
      if (screen === 'summary') break;
      expect(screen, 'the request ends with its parade, not on the island').not.toBe('home');
      await expect(pier).toHaveAttribute('data-workshop', 'road-crew');
      if (screen === 'feedback') {
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        continue;
      }
      const format = (await stage.locator('.ni-widget').getAttribute('data-format')) ?? '';
      const answer = ANSWER[format];
      if (!answer) throw new Error(`this spec cannot answer the "${format}" format: add it`);
      if (screen === 'turn') {
        // The child's turn in the lesson's faded example: in the workshop, with its row of stones.
        lessonInWorld = true;
        await expect(tray).toHaveAttribute('data-made', '0');
        await answer(stage);
        await check();
        continue;
      }
      formats.push(format);
      await expect(tray).toHaveAttribute('data-made', String(stones));
      if (wrong === null && WRONG[format]) {
        // One wrong first try: the look-again cue, no stone, and the same item again.
        wrong = format;
        await WRONG[format](stage);
        await check();
        await expect(cue).toHaveAttribute('data-cue', 'again');
        expect(await waiting(page)).toBe('answer');
        expect(await made()).toBe(stones);
        await answer(stage);
        await check();
        // Right on the second try: that made the stone.
        await rightAnswer();
        expect(stones).toBe(1);
        continue;
      }
      await answer(stage);
      await check();
      await rightAnswer();
    }
  });
  expect(lessonInWorld, 'the warmup lesson played in the workshop').toBe(true);
  expect(wrong, 'one item was answered wrong first').not.toBeNull();
  expect(stones).toBeGreaterThan(1);
  for (const format of formats) expect(['hundred-chart', 'tap-count', 'order']).toContain(format);

  await test.step('the parade: the stones made, one of them onto the road with its number', async () => {
    const summary = page.getByTestId('pier-summary');
    await expect(summary).toHaveAttribute('data-workshop', 'road-crew');
    await expect(page.getByText('All done! Look at your stones!')).toBeVisible();
    const parade = page.getByTestId('road-crew-parade');
    await expect(parade).toHaveAttribute('data-made', String(stones));
    await expect(parade).toHaveAttribute('data-laid', '1');
    const laid = page.getByTestId('road-crew-laid');
    await expect(laid).toHaveText('1');
    await expect(laid).toHaveAccessibleName('Stone 1 is on the road');
    await expect(page.getByTestId('road-crew-stored')).toHaveAttribute(
      'data-stones',
      String(stones - 1),
    );
    await page.getByRole('button', { name: 'Okay!' }).click();
  });

  await test.step('back on the island: the road is one stone longer, the others are stored', async () => {
    await expect(page.getByTestId('child-home')).toBeVisible();
    await expect(page.locator('[data-layer="road"]')).toHaveAttribute('data-road-length', '1');
    await expect(
      page.locator('[data-stone="1"][data-state="laid"], [data-stone="1"][data-state="counting"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId('arrived')).toHaveAttribute('data-count', String(stones));

    const events = await localEvents(page);
    const produced = of(events, 'material.produced');
    expect(produced.map((e) => e.payload)).toEqual([
      expect.objectContaining({
        requestId: picked,
        workshopId: 'road-crew',
        materials: { stone: stones },
      }),
    ]);
    expect(of(events, 'road.extended').map((e) => e.payload)).toEqual([{ to: 1 }]);
    expect(of(events, 'material.spent').map((e) => e.payload)).toEqual([
      { materials: { stone: 1 }, purpose: { kind: 'build', ref: 'road' } },
    ]);
    const completed = of(events, 'request.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload).toMatchObject({ requestId: picked, endedEarly: false });
    // Every item ended right, one of them on its second try.
    expect(completed[0]?.payload.items).toBe(right);
    expect(completed[0]?.payload.firstTryCorrect).toBe(right - 1);
    // The road stone is written after what the request made, and before the island shows it.
    const order = events.map((e) => e.type);
    expect(order.indexOf('material.produced')).toBeLessThan(order.indexOf('road.extended'));
    const attempts = of(events, 'attempt');
    expect(attempts.filter((a) => a.payload.correct === false)).toHaveLength(1);

    await page.getByRole('button', { name: 'Storehouse', exact: true }).click();
    await expect(
      page.getByTestId('storehouse-piles').locator('li[data-material="stone"]'),
    ).toHaveAttribute('data-count', String(stones - 1));
  });

  expect(errors).toEqual([]);
});
