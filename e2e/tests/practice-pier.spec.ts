import { expect, type Locator, type Page, test } from '@playwright/test';
import { learnerProjection, localEvents, seedLocalChild } from '../fixtures/localChild';

// #20 part 1: a child opens Practice Pier and plays real K items of three formats (tap-count,
// numeral-pick, number-pad) with the real widgets. Every attempt lands in the local event log and
// in the learner projection, and the session records its math time.
//
// The child is local to this browser (no pairing, no sync). The request comes from the dev
// content browser, so the formats are known: one item per template of CNT.03.
//
// Time: the page runs on Playwright's clock. Before each answer the clock jumps ahead, so answers
// are never "rapid taps" (04 §6.4) and never inside a widget's 400 ms check debounce (06 §4).
// Nothing here waits on, or asserts, elapsed real time.

const CHILD = { id: '019c0000-0000-7000-8000-00000000e2e1', name: 'Ada', grade: 'K' as const };
const SKILL = 'CNT.03';

interface Attempt {
  format: string;
  correct: boolean;
  attemptNo: number;
  latencyMs: number;
  skillId: string;
  partialCredit: number;
}

const attempts = async (page: Page) =>
  (await localEvents(page))
    .filter((e) => e.type === 'attempt')
    .map((e) => e.payload as unknown as Attempt);

/** Presses the widget's Check after a jump in time, and returns the cue the pier then shows. */
async function check(page: Page, stage: Locator, logged: number): Promise<string> {
  await page.clock.fastForward(3000);
  await stage.getByRole('button', { name: 'Check' }).click();
  await expect.poll(async () => (await attempts(page)).length).toBe(logged + 1);
  const cue = page.getByTestId('pier-cue');
  await expect(cue).not.toHaveAttribute('data-cue', 'none');
  await expect(page.getByTestId('pier')).toHaveAttribute('data-phase', /answer|feedback/);
  return (await cue.getAttribute('data-cue')) as string;
}

test('a child plays a request at the Practice Pier: three formats, every attempt recorded', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await seedLocalChild(page, CHILD);
  await page.evaluate(() => localStorage.setItem('ni.dev', '1'));
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();

  // The child's way in is the big button; the content browser is the developer's.
  await expect(page.getByRole('button', { name: "Let's play!" })).toBeVisible();
  await page.getByRole('link', { name: 'Content browser (dev)' }).click();
  await expect(page.getByTestId('pier-browser')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${SKILL.replace('.', '\\.')} `) }).click();

  const pier = page.getByTestId('pier');
  const stage = page.getByTestId('pier-stage');
  const cueText = page.getByTestId('pier-cue');
  const progress = page.getByTestId('pier-progress');
  const ready = () => expect(pier).toHaveAttribute('data-phase', 'answer');
  const widget = stage.locator('.ni-widget');
  let logged = 0;

  await test.step('tap-count: count every object, pick the number, and it is right', async () => {
    await ready();
    await expect(widget).toHaveAttribute('data-format', 'tap-count');
    await expect(widget).toHaveAttribute('data-registered', 'true');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    // The prompt is on screen as a button that speaks it again (its words are its name).
    await expect(page.getByRole('banner').getByRole('button', { name: /\?$/ })).toBeVisible();
    const things = stage.getByRole('group', { name: 'Look at the picture' }).getByRole('button');
    const count = await things.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) await things.nth(i).click();
    await stage.getByRole('button', { name: String(count), exact: true }).click();
    expect(await check(page, stage, logged)).toBe('right');
    logged += 1;
    await expect(pier).toHaveAttribute('data-phase', 'feedback');
    // The cue is a status with the spoken praise as its text; the widget takes no more input.
    await expect(cueText).toHaveText(/\S/);
    await expect(stage.getByRole('button', { name: 'Check' })).toBeDisabled();
    // The child's work stays on screen while the feedback shows.
    await expect(stage.getByRole('button', { name: String(count), exact: true })).toBeVisible();
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect((await attempts(page)).at(-1)).toMatchObject({
      format: 'tap-count',
      correct: true,
      attemptNo: 1,
      partialCredit: 1,
      skillId: SKILL,
    });
    await page.getByRole('button', { name: 'Next' }).click();
  });

  await test.step('a wrong answer gets a second try on the same item, then the pier moves on', async () => {
    await ready();
    await expect(widget).toHaveAttribute('data-format', 'tap-count');
    // Nothing to count is never the answer here: 0 is wrong.
    await stage.getByRole('button', { name: '0', exact: true }).click();
    expect(await check(page, stage, logged)).toBe('again');
    logged += 1;
    // Same item, same widget, the child's answer still in it; input is open again.
    await expect(pier).toHaveAttribute('data-phase', 'answer');
    await expect(stage.getByRole('button', { name: /Your answer: 0/ })).toBeVisible();
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
    expect(await check(page, stage, logged)).toBe('onward');
    logged += 1;
    await expect(pier).toHaveAttribute('data-phase', 'feedback');
    const log = await attempts(page);
    expect(log.slice(-2).map((a) => [a.attemptNo, a.correct])).toEqual([
      [1, false],
      [2, false],
    ]);
    await page.getByRole('button', { name: 'Next' }).click();
  });

  await test.step('the rest of the request: numeral-pick, number-pad, then the summary', async () => {
    const summary = page.getByTestId('pier-summary');
    // The engine may add an item (a confidence item after several misses), so play what comes.
    for (let i = 0; i < 6; i += 1) {
      // The next item is ready, or the request is over.
      await expect(
        page.locator('[data-testid="pier"][data-phase="answer"]').or(summary),
      ).toBeVisible();
      if (await summary.isVisible()) break;
      const format = await widget.getAttribute('data-format');
      for (let tries = 0; tries < 2; tries += 1) {
        if (format === 'numeral-pick') {
          await stage.getByRole('group', { name: 'Pick one' }).getByRole('button').first().click();
        } else if (tries === 0) {
          // A pad or a numeral tray: enter 1.
          await stage.getByRole('button', { name: '1', exact: true }).click();
        }
        const cue = await check(page, stage, logged);
        logged += 1;
        const last = (await attempts(page)).at(-1);
        expect(last?.format).toBe(format);
        expect(last?.correct).toBe(cue === 'right');
        if (cue !== 'again') break;
      }
      await page.getByRole('button', { name: 'Next' }).click();
    }
    await expect(summary).toBeVisible();
    await expect(summary.getByRole('button', { name: 'All done! Great playing!' })).toBeVisible();
  });

  await test.step('the log, the projection and the session agree', async () => {
    const log = await attempts(page);
    expect(log).toHaveLength(logged);
    const formats = new Set(log.map((a) => a.format));
    expect([...formats].sort()).toEqual(['number-pad', 'numeral-pick', 'tap-count']);
    for (const a of log) expect(a.latencyMs).toBeGreaterThanOrEqual(3000);
    const items = log.filter((a) => a.attemptNo === 1).length;
    expect(items).toBeGreaterThanOrEqual(4);

    const events = await localEvents(page);
    const completed = events.filter((e) => e.type === 'request.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload).toMatchObject({ items, workshopId: 'practice-pier' });
    // Only first tries are rated (04 §2.3).
    await expect.poll(async () => (await learnerProjection(page, CHILD.id))?.nTotal).toBe(items);

    // Okay returns to the browser; Home, then Home again, ends the session.
    await page.getByRole('button', { name: 'Okay!' }).click();
    await expect(page.getByTestId('pier-browser')).toBeVisible();
    await page.getByRole('button', { name: 'Go home' }).click();
    await expect(page.getByTestId('child-home')).toBeVisible();
    await page.getByRole('button', { name: 'Go home' }).click();
    await expect(
      page.getByTestId('tap-to-start').or(page.getByText('Who is playing?')),
    ).toBeVisible();
    await expect
      .poll(async () => (await localEvents(page)).filter((e) => e.type === 'session.ended').length)
      .toBe(1);
    const ended = (await localEvents(page)).find((e) => e.type === 'session.ended');
    // Math density (04 §7): the session carries its item count and its math time.
    expect(ended?.payload).toMatchObject({ reason: 'child-exit', items });
    expect(ended?.payload.mathMs as number).toBeGreaterThanOrEqual(3000 * items);
    expect(ended?.payload.mathMs as number).toBeLessThanOrEqual(ended?.payload.activeMs as number);
  });

  expect(errors).toEqual([]);
});

test('the planned request opens from the child home and Home leaves it without ending the session', async ({
  page,
}) => {
  await seedLocalChild(page, { ...CHILD, id: '019c0000-0000-7000-8000-00000000e2e2' });
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  // No dev flag: a child never sees the content browser.
  await expect(page.getByRole('link', { name: 'Content browser (dev)' })).toHaveCount(0);
  await page.getByRole('button', { name: "Let's play!" }).click();
  const pier = page.getByTestId('pier');
  await expect(pier).toHaveAttribute('data-phase', 'answer');
  const widget = page.getByTestId('pier-stage').locator('.ni-widget');
  // The planner's request for a new kindergartner: a real item in a registered widget.
  await expect(widget).toHaveAttribute('data-registered', 'true');
  expect(
    Number(await page.getByTestId('pier-progress').getAttribute('aria-valuemax')),
  ).toBeGreaterThan(2);
  // Nothing scrolls on the task screen.
  const overflow = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth - window.innerWidth,
    h: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow).toEqual({ w: 0, h: 0 });

  await page.getByRole('button', { name: 'Go home' }).click();
  await expect(page.getByTestId('child-home')).toBeVisible();
  const types = async () => (await localEvents(page)).map((e) => e.type);
  expect(await types()).toEqual(['session.started', 'request.accepted', 'request.completed']);

  // Leaving with the browser's back button completes the request too.
  await page.getByRole('button', { name: "Let's play!" }).click();
  await expect(pier).toHaveAttribute('data-phase', 'answer');
  await page.goBack();
  await expect(page.getByTestId('child-home')).toBeVisible();
  await expect
    .poll(types)
    .toEqual([
      'session.started',
      'request.accepted',
      'request.completed',
      'request.accepted',
      'request.completed',
    ]);
});

test('a widget that cannot load ends the request and logs no answer', async ({ page }) => {
  await page.route(/\/assets\/TapCountWidget-[^/]+\.js$/, (route) => route.abort());
  await seedLocalChild(page, { ...CHILD, id: '019c0000-0000-7000-8000-00000000e2e3' });
  await page.evaluate(() => localStorage.setItem('ni.dev', '1'));
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await page.getByRole('link', { name: 'Content browser (dev)' }).click();
  await page.getByRole('searchbox').fill('CNT.02');
  await page.getByRole('button', { name: /^t1 tap-count / }).click();

  const pier = page.getByTestId('pier');
  await expect(pier).toHaveAttribute('data-phase', 'answer');
  const stage = page.getByTestId('pier-stage');
  // The placeholder stands in for the widget; its "next" is not the child's answer.
  await expect(stage.locator('.ni-placeholder')).toBeVisible();
  await stage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('pier-summary')).toBeVisible();
  const events = await localEvents(page);
  expect(events.filter((e) => e.type === 'attempt')).toEqual([]);
  expect(events.find((e) => e.type === 'request.completed')?.payload).toMatchObject({
    items: 0,
    endedEarly: true,
  });
});
