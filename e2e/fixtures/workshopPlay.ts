import { expect, type Locator, type Page } from '@playwright/test';

// Playing a request in a workshop screen (the Practice Pier's or a themed workshop's: they share
// one screen, `apps/web/src/workshops/play`), for the specs that play requests to their end.

export type Screen = 'home' | 'summary' | 'feedback' | 'turn' | 'answer';

/** Plays out what is playing (a lesson's demo, a spoken line) until a screen waits for the child. */
export async function waiting(page: Page): Promise<Screen> {
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

/** How a spec answers each format it meets, in the real widget, right. */
export const ANSWER: Record<string, (stage: Locator) => Promise<void>> = {
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
