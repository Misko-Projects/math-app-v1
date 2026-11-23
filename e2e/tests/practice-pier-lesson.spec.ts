import { expect, type Page, test } from '@playwright/test';
import { localEvents, seedLocalChild } from '../fixtures/localChild';

// #20 part 3: a child is taken through a skill's lesson at the Practice Pier (03 §6): the worked
// example plays in the widget, the faded examples hand the last part to the child, the scaffolded
// item opens with its hint, and the lesson leads into a practice item. Every step lands in the
// local event log as `lesson.step`.
//
// The child is local to this browser (no pairing). The lesson is opened from the dev content
// browser, so it is known: CNT.03, counting a set (authored).
//
// Time: the page runs on Playwright's clock, and no line is spoken in real time: the audio
// manifest is not served, and this Chromium has no on-device voice, so a line is over at once.
// A demo step the widget animates is played out by running the clock. Nothing here waits on, or
// asserts, elapsed real time.

const CHILD = { id: '019c0000-0000-7000-8000-00000000e2f1', name: 'Ada', grade: 'K' as const };
const SKILL = 'CNT.03';

interface Step {
  phase: string;
  example: number;
  step: number;
  actor: string;
  outcome: string;
}

const steps = async (page: Page) =>
  (await localEvents(page))
    .filter((e) => e.type === 'lesson.step')
    .map((e) => e.payload as unknown as Step);

/** Plays out what is playing (demo steps, a hint) until the pier shows one of `phases`. */
async function until(page: Page, phases: RegExp): Promise<void> {
  const pier = page.getByTestId('pier');
  await expect(async () => {
    await page.clock.runFor(1000);
    await expect(pier).toHaveAttribute('data-phase', phases, { timeout: 250 });
  }).toPass();
}

test('a child is taken through a lesson at the Practice Pier, into practice', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/audio/manifest.json', (route) => route.abort());
  await page.clock.install();
  await seedLocalChild(page, CHILD);
  await page.evaluate(() => localStorage.setItem('ni.dev', '1'));
  await page.getByTestId('tap-to-start').click();
  await page.getByRole('button', { name: CHILD.name, exact: true }).click();
  await page.getByRole('link', { name: 'Content browser (dev)' }).click();
  await page.getByRole('searchbox').fill(SKILL);
  await page
    .getByRole('listitem')
    .filter({
      has: page.getByRole('button', { name: new RegExp(`^${SKILL.replace('.', '\\.')} `) }),
    })
    .getByRole('button', { name: /^Lesson/ })
    .click();

  const pier = page.getByTestId('pier');
  const stage = page.getByTestId('pier-stage');
  const widget = stage.locator('.ni-widget');
  const check = stage.getByRole('button', { name: 'Check' });
  const number = (n: number) => stage.getByRole('button', { name: String(n), exact: true });

  await test.step('the worked example plays by itself, then the first faded example waits for the child', async () => {
    // While the demo plays, the widget takes no input and the step can be heard again.
    await expect(pier).toHaveAttribute('data-phase', /lesson|turn/);
    await expect(widget).toHaveAttribute('data-format', 'tap-count');
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Hear it again' }),
    ).toBeVisible();
    // K has no "I can try" (03 §6.2).
    await expect(page.getByRole('button', { name: 'I can try' })).toHaveCount(0);
    await until(page, /turn/);
    const logged = await steps(page);
    expect(logged[0]).toMatchObject({ phase: 'intro', actor: 'demo', outcome: 'done' });
    expect(logged.filter((s) => s.phase === 'worked').length).toBeGreaterThanOrEqual(2);
    expect(logged.every((s) => s.actor === 'demo' && s.outcome === 'done')).toBe(true);
    expect(logged.at(-1)).toMatchObject({ phase: 'faded', example: 0 });
    // No hint button on the child's turn: the lesson is the help.
    await expect(page.getByRole('button', { name: 'Help me' })).toHaveCount(0);
    await expect(check).toBeVisible();
  });

  await test.step('two unsuccessful tries: the demo does the step, with no "wrong" cue', async () => {
    await number(0).click();
    await page.clock.fastForward(3000);
    await check.click();
    await until(page, /turn/);
    await expect(page.getByTestId('pier-stage-cue')).toHaveCount(0);
    await expect(page.getByTestId('pier-cue')).toHaveAttribute('data-cue', 'none');
    await number(0).click();
    await page.clock.fastForward(3000);
    await check.click();
    // The demo finishes the example, and the second faded example comes to the child's turn.
    await expect
      .poll(async () => {
        await page.clock.runFor(1000);
        return (await steps(page)).some((s) => s.outcome === 'demo-corrected');
      })
      .toBe(true);
    await until(page, /turn/);
    const logged = await steps(page);
    expect(
      logged.filter((s) => s.outcome === 'demo-corrected').every((s) => s.actor === 'child'),
    ).toBe(true);
    expect(logged.at(-1)).toMatchObject({ phase: 'faded', example: 1, actor: 'demo' });
  });

  await test.step('the child does the last part of the second faded example', async () => {
    const things = stage.getByRole('group', { name: 'Look at the picture' }).getByRole('button');
    const count = await things.count();
    // The demo counted the set; naming how many is the child's.
    await stage.getByRole('button', { name: 'Next', exact: true }).click();
    await number(count).click();
    await page.clock.fastForward(3000);
    // Nothing in the widget points at the answer on the child's turn.
    await expect(stage.locator('.ni-invite')).toHaveCount(0);
    await check.click();
    await expect(pier).toHaveAttribute('data-phase', 'feedback');
    await expect(page.getByTestId('pier-cue')).toHaveAttribute('data-cue', 'right');
    expect((await steps(page)).at(-1)).toMatchObject({
      phase: 'faded',
      example: 1,
      actor: 'child',
      outcome: 'done',
    });
    await page.getByRole('button', { name: 'Next' }).click();
  });

  await test.step('a scaffolded item opens with its hint; right with no hint used skips the rest', async () => {
    await until(page, /answer/);
    // The hint that opened the item has the bubble; it is not a hint the child used.
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Hear it again' }),
    ).toBeVisible();
    const things = stage.getByRole('group', { name: 'Look at the picture' }).getByRole('button');
    const count = await things.count();
    for (let i = 0; i < count; i += 1) await things.nth(i).click();
    await number(count).click();
    await page.clock.fastForward(3000);
    await check.click();
    await expect(pier).toHaveAttribute('data-phase', 'feedback');
    await expect(page.getByTestId('pier-cue')).toHaveAttribute('data-cue', 'right');
    await page.getByRole('button', { name: 'Next' }).click();
  });

  await test.step('the lesson hands over to a practice item, and the log holds every step', async () => {
    // The outro plays by itself, then the practice item is ready.
    await until(page, /answer/);
    const events = await localEvents(page);
    const attempts = events.filter((e) => e.type === 'attempt').map((e) => e.payload);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      context: 'lesson',
      correct: true,
      hintsUsed: 0,
      partialCredit: 1,
      skillId: SKILL,
    });
    expect(events.filter((e) => e.type === 'hint.used')).toEqual([]);
    const logged = (await steps(page)).map(
      (s) => `${s.phase}:${s.example}:${s.actor}:${s.outcome}`,
    );
    expect(logged).toContain('scaffolded:0:child:done');
    expect(logged).toContain('scaffolded:1:child:skipped');
    expect(logged.at(-1)).toBe('outro:0:demo:done');
    // The practice item is not part of the lesson: it has the lightbulb.
    await expect(page.getByRole('button', { name: 'Help me' })).toBeVisible();

    // Leaving now records the request as ended early, with the one item played.
    await page.getByRole('button', { name: 'Go home' }).click();
    await expect(page.getByTestId('pier-browser')).toBeVisible();
    const completed = (await localEvents(page)).filter((e) => e.type === 'request.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload).toMatchObject({ items: 1, endedEarly: true });
  });

  expect(errors).toEqual([]);
});
