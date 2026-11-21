import { formatModel } from '@number-island/engine';
import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { HAND_POINTER_TIP } from '../../primitives/icons';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
  touchDragAndHold,
} from '../../test-support/storyHelpers';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import { WidgetHost, type WidgetHostProps } from '../WidgetHost';

/**
 * `expanded-form` (03 §5.5): place-value cards and expanded expressions. `build` answers the
 * placed cards as `numbers`; `fill` one `number` or several `numbers`; `to-standard`,
 * `digit-value` and heard `words` a `number`; `words` with word cards a `choice`.
 */

type Config = ConfigFor<'expanded-form'>;

const build345: Config = {
  format: 'expanded-form',
  target: 345,
  mode: 'build',
  cards: [300, 40, 5, 400, 30, 50],
  unusualOrder: false,
};

/** 34 as 10 + 10 + 10 + 4: three copies of one card. */
const buildDuplicates: Config = {
  format: 'expanded-form',
  target: 34,
  mode: 'build',
  cards: [10, 4, 10, 30, 10, 3],
  unusualOrder: false,
};

/** K range (CPS.07, a teen number as 10 plus ones): 14 = 10 + 4, distractors 40 and 1. */
const buildTeenK: Config = {
  format: 'expanded-form',
  target: 14,
  mode: 'build',
  cards: [10, 4, 40, 1],
  unusualOrder: false,
};

/**
 * A large build: 3,405 from eight cards, distractors included. (One card more than the schema's
 * seven: these pictures are small. `StressSevenWideCards` draws the schema's own worst case.)
 */
const buildStress: Config = {
  format: 'expanded-form',
  target: 3405,
  mode: 'build',
  cards: [3000, 400, 5, 300, 40, 50, 4000, 500],
  unusualOrder: false,
};

/** Three blanks: □ + □ + □ = 345. */
const fillThree: Config = {
  format: 'expanded-form',
  target: 345,
  mode: 'fill',
  expression: {
    tokens: [
      { t: 'blank', id: 'h' },
      { t: 'op', v: '+' },
      { t: 'blank', id: 't' },
      { t: 'op', v: '+' },
      { t: 'blank', id: 'o' },
      { t: 'rel', v: '=' },
      { t: 'num', v: 345 },
    ],
  },
  unusualOrder: false,
};

/** 300 + □ + □ = 345, with cards. */
const fillCards: Config = {
  format: 'expanded-form',
  target: 345,
  mode: 'fill',
  cards: [40, 5, 4, 50],
  expression: {
    tokens: [
      { t: 'num', v: 300 },
      { t: 'op', v: '+' },
      { t: 'blank', id: 'b0' },
      { t: 'op', v: '+' },
      { t: 'blank', id: 'b1' },
      { t: 'rel', v: '=' },
      { t: 'num', v: 345 },
    ],
  },
  unusualOrder: false,
};

const toStandard: Config = {
  format: 'expanded-form',
  target: 345,
  mode: 'to-standard',
  expression: {
    tokens: [
      { t: 'num', v: 300 },
      { t: 'op', v: '+' },
      { t: 'num', v: 40 },
      { t: 'op', v: '+' },
      { t: 'num', v: 5 },
    ],
  },
  unusualOrder: false,
};

/** Four digits, parts out of place-value order (and an internal zero). */
const toStandardUnusual: Config = {
  format: 'expanded-form',
  target: 3405,
  mode: 'to-standard',
  expression: {
    tokens: [
      { t: 'num', v: 5 },
      { t: 'op', v: '+' },
      { t: 'num', v: 3000 },
      { t: 'op', v: '+' },
      { t: 'num', v: 400 },
    ],
  },
  unusualOrder: true,
};

// Story fixtures: the ui.widget.ef.story.* keys exist only so these stories have long words to
// show. Real items point wordOptions at their own template keys.
const wordsChoice: Config = {
  format: 'expanded-form',
  target: 3405,
  mode: 'words',
  unusualOrder: false,
  wordOptions: [
    { id: 'a', words: 'ui.widget.ef.story.w3450' },
    { id: 'b', words: 'ui.widget.ef.story.w3405' },
    { id: 'c', words: 'ui.widget.ef.story.w4305' },
    { id: 'd', words: 'ui.widget.ef.story.w3045' },
  ],
};

const wordsHear: Config = {
  format: 'expanded-form',
  target: 345,
  mode: 'words',
  unusualOrder: false,
};

/** What is the 4 in 3,475 worth? */
const digitValue: Config = {
  format: 'expanded-form',
  target: 3475,
  mode: 'digit-value',
  digitIndex: 1,
  unusualOrder: false,
};

const meta = {
  title: 'Widgets/Expanded form',
  args: {
    config: build345 as WidgetConfig,
    tier: 'pictorial',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-efw';

const trayCard = (root: HTMLElement, v: number) =>
  root.querySelector(`.ni-efw__card[data-in="tray"][data-card="${v}"]`) as HTMLElement;
const trayCards = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-efw__card[data-in="tray"]'),
];
const matCards = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-efw__card[data-in="mat"]'),
];
const pad = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-place-target="${id}"]`) as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const checkButton = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
/** Evidence stories end on a calm frame: no focus ring left on the last control tapped. */
const endFrame = () => (document.activeElement as HTMLElement | null)?.blur();
const steps = (onInteract: unknown) => traceOf(onInteract).map((e) => `${e.t}:${e.target}`);

/** Tap a tray card, then the mat (tap-to-place). */
async function tapPlace(root: HTMLElement, v: number) {
  await userEvent.click(trayCard(root, v));
  await userEvent.click(pad(root, 'build'));
}

/**
 * The widget fits the 1280 × 800 tablet's widget area: the stage stays within 800 px minus the
 * story padding, the widget scrolls neither way and no part of it sticks out.
 */
async function expectFits(canvasElement: HTMLElement, root: HTMLElement) {
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  await expect(stage.getBoundingClientRect().height).toBeLessThanOrEqual(720);
  await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth + 1);
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
  const box = root.getBoundingClientRect();
  for (const part of root.querySelectorAll<HTMLElement>('*')) {
    const r = part.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const name = part.className.toString() || part.tagName;
    await expect(r.left, `${name} left`).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, `${name} right`).toBeLessThanOrEqual(box.right + 0.5);
    await expect(r.top, `${name} top`).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, `${name} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
  }
}

/**
 * Nothing on screen or in the DOM names `answer` (text, labels, data attributes, titles). The
 * number pad's own keys (1 2 3 … 0) are left out: they are the input, not a stimulus.
 */
async function expectNoLeak(root: HTMLElement, answer: string) {
  const shown = root.cloneNode(true) as HTMLElement;
  for (const keys of shown.querySelectorAll('.ni-pad')) keys.remove();
  await expect(shown.textContent ?? '').not.toContain(answer);
  for (const node of shown.querySelectorAll('*')) {
    for (const attr of node.attributes) {
      await expect(attr.value, `${node.tagName} ${attr.name}`).not.toContain(answer);
    }
  }
}

/**
 * Cards on one line share one height, and their numerals share one top (and so one baseline):
 * a 1-digit card is no shorter and sits no higher than a 3-digit card beside it.
 */
async function expectLinesAligned(cards: HTMLElement[]) {
  const lines = new Map<number, HTMLElement[]>();
  for (const c of cards) {
    const top = Math.round(c.getBoundingClientRect().top);
    lines.set(top, [...(lines.get(top) ?? []), c]);
  }
  for (const line of lines.values()) {
    const heights = line.map((c) => c.getBoundingClientRect().height);
    await expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    const numeralTops = line.map(
      (c) => (c.querySelector('.ni-efw__digits') as HTMLElement).getBoundingClientRect().top,
    );
    await expect(Math.max(...numeralTops) - Math.min(...numeralTops)).toBeLessThanOrEqual(1);
  }
}

/**
 * The ones cue on pictorial cards is legible or absent: every unit cube is ≥ 12 px (≥ 16 px in
 * K), in rows of at most five, inside its card. Returns how many cubes were checked.
 */
async function expectOnesCueLegible(root: HTMLElement, ageMode: 'k' | 'g1-up') {
  const min = ageMode === 'k' ? 16 : 12;
  let checked = 0;
  for (const cue of root.querySelectorAll<HTMLElement>('.ni-efw__glyphs[data-place="0"]')) {
    if (cue.getBoundingClientRect().width === 0) continue; // hidden (stacked cards)
    const card = cue.closest('.ni-efw__card') as HTMLElement;
    const box = card.getBoundingClientRect();
    const rows = new Map<number, number>();
    for (const cube of cue.querySelectorAll<HTMLElement>('.ni-efw__glyph')) {
      const r = cube.getBoundingClientRect();
      await expect(r.width, `ones cube on ${card.dataset.card}`).toBeGreaterThanOrEqual(min - 0.5);
      await expect(r.height, `ones cube on ${card.dataset.card}`).toBeGreaterThanOrEqual(min - 0.5);
      await expect(r.left).toBeGreaterThanOrEqual(box.left);
      await expect(r.right).toBeLessThanOrEqual(box.right);
      const top = Math.round(r.top);
      rows.set(top, (rows.get(top) ?? 0) + 1);
      checked += 1;
    }
    for (const n of rows.values()) await expect(n).toBeLessThanOrEqual(5);
  }
  return checked;
}

/** A numeral reads as one number: each digit starts where the previous one ends (± 2 px). */
async function expectTightDigits(numeral: HTMLElement, digitSelector: string) {
  const digits = [...numeral.querySelectorAll<HTMLElement>(digitSelector)].map((d) =>
    d.getBoundingClientRect(),
  );
  for (let i = 1; i < digits.length; i++) {
    const gap = (digits[i] as DOMRect).left - (digits[i - 1] as DOMRect).right;
    await expect(Math.abs(gap), `gap after digit ${i - 1}`).toBeLessThanOrEqual(2);
  }
}

async function expectNumeralsAtLeast32(root: HTMLElement, selector: string) {
  for (const n of root.querySelectorAll<HTMLElement>(selector)) {
    await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

// ---------- build ----------

/**
 * Build, G1 pictorial: make 345 from cards (distractors 400, 30, 50). Tap a card, tap the mat;
 * placed cards read "300 + 40 + 5". The target is one number: tapping it speaks "three hundred
 * forty-five". Answers the placed values as `numbers`.
 */
export const Build: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(checkButton(root)).toBeDisabled();
    // Every card is a G1 target, spaced ≥ 12 px; numerals ≥ 32 px.
    const cards = trayCards(root);
    await expect(cards).toHaveLength(6);
    for (const c of cards) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(cards);
    await expectLinesAligned(cards);
    await expectNumeralsAtLeast32(root, '.ni-efw__digits, .ni-efw__number');
    // Pictorial tier: each card carries its base-ten picture (3 flats on 300).
    await expect(
      trayCard(root, 300).querySelectorAll('.ni-efw__glyph[data-place="2"]'),
    ).toHaveLength(3);
    // Five legible unit cubes on the 5 card (≥ 12 px each, one row).
    await expect(await expectOnesCueLegible(root, 'g1-up')).toBe(5);
    // Numbers read as one number: tight digits in the target and on every card.
    await expectTightDigits(root.querySelector('.ni-efw__number') as HTMLElement, '.ni-efw__nd');
    for (const c of cards) await expectTightDigits(c, '.ni-efw__cell');
    // The target is ONE tap target that speaks the whole number.
    const target = canvas.getByRole('button', { name: '345' });
    await expectTargetSize(target, 'g1-up');
    await userEvent.click(target);
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 345 }]);

    await tapPlace(root, 300);
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 300 }]);
    await tapPlace(root, 40);
    await tapPlace(root, 5);
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['300', '40', '5']);
    await expect(root.querySelectorAll('.ni-efw__plus')).toHaveLength(2);
    await expect(trayCards(root)).toHaveLength(3);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [300, 40, 5] });
    await expect(steps(args.onInteract)).toEqual([
      'tap:number',
      'tap:card-300',
      'tap:build',
      'tap:card-40',
      'tap:build',
      'tap:card-5',
      'tap:build',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * Build in progress (G1 pictorial): 300 and 40 are on the mat, the 5 is still to come. Cards on
 * a line share one height and their numerals one baseline; "check" is on (something is placed).
 */
export const BuildInProgress: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Empty mat: a dashed spot with an arrow shows where cards go; "check" waits for one.
    await expect(root.querySelector('.ni-efw__ghost')).not.toBeNull();
    await expect(checkButton(root)).toBeDisabled();
    await expectLinesAligned(trayCards(root));
    await tapPlace(root, 300);
    await tapPlace(root, 40);
    await expect(root.querySelector('.ni-efw__ghost')).toBeNull();
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['300', '40']);
    await expectLinesAligned(matCards(root));
    await expectLinesAligned(trayCards(root));
    await expect(await expectOnesCueLegible(root, 'g1-up')).toBe(5);
    await expect(checkButton(root)).toBeEnabled();
    await expect(args.onResponse).not.toHaveBeenCalled();
    await expectFits(canvasElement, root);
    endFrame();
  },
};

/**
 * Build in K mode, K content: 14 = 10 + 4 (distractors 40 and 1). Cards, the number and the mat
 * are K-sized (≥ 80 px); "check" is icon-only.
 */
export const BuildK: Story = {
  globals: { ageMode: 'k' },
  args: { config: buildTeenK },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cards = trayCards(root);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    await expectTargetSize(root.querySelector('.ni-efw__number') as HTMLElement, 'k');
    const check = checkButton(root);
    await expect(check).not.toHaveTextContent('Check');
    await expectTargetSize(check, 'k');
    await tapPlace(root, 10);
    await tapPlace(root, 4);
    for (const c of matCards(root)) await expectTargetSize(c, 'k');
    await expectTargetGaps(matCards(root));
    await expectLinesAligned(matCards(root));
    await expectLinesAligned(trayCards(root));
    // K: unit cubes ≥ 16 px on the 4 card (4) and the 1 card (1), never a dot.
    await expect(await expectOnesCueLegible(root, 'k')).toBe(5);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [10, 4] });
    await expectFits(canvasElement, root);
    endFrame();
  },
};

/** Three copies of the 10 card: each copy placed leaves the tray; 34 = 10 + 10 + 10 + 4. */
export const BuildDuplicateCards: Story = {
  args: { config: buildDuplicates, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const tens = () => root.querySelectorAll('.ni-efw__card[data-in="tray"][data-card="10"]');
    await expect(tens()).toHaveLength(3);
    await tapPlace(root, 10);
    await expect(tens()).toHaveLength(2);
    await tapPlace(root, 10);
    await tapPlace(root, 10);
    await expect(tens()).toHaveLength(0);
    await tapPlace(root, 4);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [10, 10, 10, 4],
    });
    // Copies share one trace id: the trace names the card, not which copy.
    await expect(steps(args.onInteract).filter((s) => s === 'tap:card-10')).toHaveLength(3);
  },
};

/** Mouse drag: drag 300, 40 and 5 onto the mat; a drop beside every target glides home. */
export const DragCard: Story = {
  args: { tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // A mis-drop (far above the widget) places nothing.
    await pointerDrag(trayCard(root, 400), {
      x: center(root).x,
      y: root.getBoundingClientRect().top - 200,
    });
    await expect(matCards(root)).toHaveLength(0);
    for (const v of [300, 40, 5]) {
      await pointerDrag(trayCard(root, v), center(pad(root, 'build')));
    }
    await waitFor(() => expect(matCards(root)).toHaveLength(3));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [300, 40, 5] });
    await expect(steps(args.onInteract)).toEqual([
      'drag:card-400',
      'drop:none',
      'drag:card-300',
      'drop:build',
      'drag:card-40',
      'drop:build',
      'drag:card-5',
      'drop:build',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Touch drag (tablet): the mat lights up under the finger, then takes the card. */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const lift = await touchDragAndHold(trayCard(root, 40), center(pad(root, 'build')));
    await expect(pad(root, 'build')).toHaveAttribute('data-over', 'true');
    await lift();
    await pointerDrag(trayCard(root, 300), center(pad(root, 'build')), 'touch');
    await pointerDrag(trayCard(root, 5), center(pad(root, 'build')), 'touch');
    await waitFor(() => expect(matCards(root)).toHaveLength(3));
    // In the order placed: 40 + 300 + 5 (the answer is unordered).
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['40', '300', '5']);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [40, 300, 5] });
    await expect(steps(args.onInteract)).toEqual([
      'drag:card-40',
      'drop:build',
      'drag:card-300',
      'drop:build',
      'drag:card-5',
      'drop:build',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Tap-to-place: tap a card (it lifts with an ink ring), tap the mat. Tapping it again drops it. */
export const TapToPlace: Story = {
  args: { tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const card = trayCard(root, 40);
    await userEvent.click(card);
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(pad(root, 'build')).toHaveAttribute('data-armed', 'true');
    // Changed my mind: tap it again to put it down.
    await userEvent.click(card);
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await tapPlace(root, 40);
    await tapPlace(root, 300);
    await tapPlace(root, 5);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [40, 300, 5] });
    await expect(steps(args.onInteract)).toEqual([
      'tap:card-40',
      'tap:card-40',
      'tap:card-40',
      'tap:build',
      'tap:card-300',
      'tap:build',
      'tap:card-5',
      'tap:build',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Keyboard (06 §7): Enter picks a card up and jumps to the mat; Enter places it; Enter checks. */
export const Keyboard: Story = {
  args: { tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const v of [300, 40, 5]) {
      trayCard(root, v).focus();
      await userEvent.keyboard('{Enter}');
      await expect(pad(root, 'build')).toHaveFocus();
      await userEvent.keyboard('{Enter}');
    }
    await expect(matCards(root)).toHaveLength(3);
    // Escape puts a picked-up card down.
    trayCard(root, 400).focus();
    await userEvent.keyboard(' ');
    await expect(trayCard(root, 400)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Escape}');
    await expect(trayCard(root, 400)).toHaveAttribute('aria-pressed', 'false');
    checkButton(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [300, 40, 5] });
    await expect(steps(args.onInteract)).toEqual([
      'tap:card-300',
      'tap:build',
      'tap:card-40',
      'tap:build',
      'tap:card-5',
      'tap:build',
      'tap:card-400',
    ]);
  },
};

/** Taking a card back: tap a placed card, then the tray; or drag it back. */
export const RemoveCard: Story = {
  args: { tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 300);
    await tapPlace(root, 400);
    await tapPlace(root, 40);
    await expect(trayCard(root, 400)).toBeNull();
    // Tap-to-place back: the placed 400, then the tray.
    await userEvent.click(within(root).getByRole('button', { name: '400 in your number' }));
    await expect(pad(root, 'tray')).toHaveAttribute('data-armed', 'true');
    await userEvent.click(pad(root, 'tray'));
    await expect(trayCard(root, 400)).not.toBeNull();
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['300', '40']);
    // Drag back: the placed 40 to the tray, then place 40 and 5 again.
    await pointerDrag(matCards(root)[1] as HTMLElement, center(pad(root, 'tray')));
    await waitFor(() => expect(matCards(root)).toHaveLength(1));
    await tapPlace(root, 40);
    await tapPlace(root, 5);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [300, 40, 5] });
    await expect(steps(args.onInteract).slice(6, 10)).toEqual([
      'tap:placed-1',
      'tap:tray',
      'drag:placed-1',
      'drop:tray',
    ]);
  },
};

const stackController: WidgetDemo = createDemoController({ strict: true });

/**
 * `stack-cards`: Pip places 5, 300 and 40, then slides them together like arrow cards,
 * right-aligned, reading 345. When the demo ends the widget is interactive again.
 */
export const StackCards: Story = {
  args: { demo: stackController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const v of [5, 300, 40])
      await stackController.play({ op: 'place-card', args: { value: v } });
    await stackController.play({ op: 'stack-cards' });
    const row = root.querySelector('.ni-efw__row--build') as HTMLElement;
    await expect(row).toHaveAttribute('data-stacked', 'true');
    const cards = matCards(root);
    const rights = cards.map((c) => Math.round(c.getBoundingClientRect().right));
    await expect(Math.max(...rights) - Math.min(...rights)).toBeLessThanOrEqual(1);
    // 300 lowest, 5 on top: the topmost card at the 5's centre is the 5.
    const five = cards.find((c) => c.dataset.card === '5') as HTMLElement;
    const hit = document.elementFromPoint(center(five).x, center(five).y);
    await expect(five.contains(hit)).toBe(true);
    // The digit columns line up: the 4 of 40 sits right above the 4 of 345's tens column.
    const cells = (v: string) => [
      ...(cards.find((c) => c.dataset.card === v) as HTMLElement).querySelectorAll('.ni-efw__cell'),
    ];
    const tensOf300 = cells('300')[1] as HTMLElement;
    const tensOf40 = cells('40')[0] as HTMLElement;
    await expect(
      Math.abs(tensOf300.getBoundingClientRect().left - tensOf40.getBoundingClientRect().left),
    ).toBeLessThanOrEqual(1);
    // It reads 345: the 3 of 300 and the 4 of 40 stay uncovered (only zeros are hidden).
    const visible = (cell: HTMLElement, owner: string) => {
      const r = cell.getBoundingClientRect();
      const card = cards.find((c) => c.dataset.card === owner) as HTMLElement;
      // A stacked cell is its digit (≈ 0.6 of it) then the column space: sample across the digit.
      return [0.1, 0.3, 0.55].every((f) =>
        card.contains(document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2)),
      );
    };
    await expect(visible(cells('300')[0] as HTMLElement, '300')).toBe(true);
    await expect(visible(tensOf40, '40')).toBe(true);
    await expect(visible(tensOf300, '300')).toBe(false);
    // Every digit keeps clear inner padding from its own card's left edge…
    for (const c of cards) {
      const first = c.querySelector('.ni-efw__cell') as HTMLElement;
      await expect(
        first.getBoundingClientRect().left - c.getBoundingClientRect().left,
      ).toBeGreaterThanOrEqual(16);
    }
    // …and a clear gap from the edge of the card lying over its column space. A stacked cell is
    // the digit's advance then the column space (letter-spacing); the covering card's outer
    // edge (2 px ring outside its frame) must stay ≥ 8 px right of the digit.
    const gapBeforeEdge = (cell: HTMLElement, over: string) => {
      const spacing = Number.parseFloat(getComputedStyle(cell).letterSpacing) || 0;
      const digitRight = cell.getBoundingClientRect().right - spacing;
      const edge = (
        cards.find((c) => c.dataset.card === over) as HTMLElement
      ).getBoundingClientRect().left;
      return edge - 2 - digitRight;
    };
    await expect(gapBeforeEdge(cells('300')[0] as HTMLElement, '40')).toBeGreaterThanOrEqual(8);
    await expect(gapBeforeEdge(tensOf40, '5')).toBeGreaterThanOrEqual(8);
    await expect(root.querySelectorAll('.ni-efw__plus')).toHaveLength(2);
    await expect(getComputedStyle(root.querySelector('.ni-efw__plus') as HTMLElement).display).toBe(
      'none',
    );
    // The demo is over: the widget is back to normal (solid cards, Check on: cards are placed).
    for (const c of cards) await expect(c).not.toHaveAttribute('aria-disabled');
    await expect(getComputedStyle(cards[0] as HTMLElement).borderStyle).toBe('solid');
    await expect(checkButton(root)).toBeEnabled();
  },
};

// ---------- fill ----------

/** Fill with the pad, three blanks (□ + □ + □ = 345): a full blank moves on; tap a blank to pick it. */
export const FillWithPad: Story = {
  args: { config: fillThree, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expectFits(canvasElement, root);
    for (const k of ['3', '0', '0']) await userEvent.click(key(root, k));
    await expect(canvas.getByRole('button', { name: 'Box 2:' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(key(root, '4'));
    await userEvent.click(key(root, '0'));
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Box 3:' }));
    await userEvent.click(key(root, '5'));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [300, 40, 5] });
    await expect(steps(args.onInteract)).toEqual([
      'tap:key-3',
      'tap:key-0',
      'tap:key-0',
      'tap:key-4',
      'tap:key-0',
      'tap:blank-o',
      'tap:key-5',
    ]);
    await expectNumeralsAtLeast32(root, '.ni-expr, .ni-efw__blank');
  },
};

/**
 * Fill with cards (300 + □ + □ = 345): a card fills the next empty blank; tapping a filled blank
 * clears it, and the next card fills that blank again.
 */
export const FillWithCards: Story = {
  args: { config: fillCards },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expectFits(canvasElement, root);
    // Only the next empty blank takes a card.
    await userEvent.click(trayCard(root, 40));
    await expect(pad(root, 'blank-b0')).toHaveAttribute('data-armed', 'true');
    await expect(pad(root, 'blank-b1')).not.toHaveAttribute('data-armed');
    await userEvent.click(pad(root, 'blank-b0'));
    await expect(canvas.getByRole('button', { name: 'Box 1: 40' })).toBeVisible();
    await expect(trayCard(root, 40)).toBeNull();
    await pointerDrag(trayCard(root, 5), center(pad(root, 'blank-b1')));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Box 2: 5' })).toBeVisible());
    // Oops: clear box 1; the 40 card goes back to the tray.
    await userEvent.click(canvas.getByRole('button', { name: 'Box 1: 40' }));
    await expect(trayCard(root, 40)).not.toBeNull();
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(trayCard(root, 40));
    await userEvent.click(pad(root, 'blank-b0'));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [40, 5] });
    await expect(steps(args.onInteract)).toEqual([
      'tap:card-40',
      'tap:blank-b0',
      'drag:card-5',
      'drop:blank-b1',
      'undo:blank-b0',
      'tap:card-40',
      'tap:blank-b0',
    ]);
  },
};

/**
 * Fill, waiting for the child (□ + □ + □ = 345): every blank is empty and dashed, the first one
 * has the caret, the pad is ready. "Check" is off until every blank has a number.
 */
export const FillEmptyBlanks: Story = {
  args: { config: fillThree, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    for (const n of [1, 2, 3]) {
      const blank = canvas.getByRole('button', { name: `Box ${n}:` });
      await expect(blank).toHaveAttribute('data-empty', 'true');
      await expect(blank).toBeEnabled();
    }
    await expect(canvas.getByRole('button', { name: 'Box 1:' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    for (const k of root.querySelectorAll('.ni-pad__key')) await expect(k).toBeEnabled();
    await expect(checkButton(root)).toBeDisabled();
    await expect(args.onResponse).not.toHaveBeenCalled();
    await expectFits(canvasElement, root);
  },
};

// ---------- to-standard ----------

/** To standard: 300 + 40 + 5 → type the number. The answer appears nowhere until typed. */
export const ToStandard: Story = {
  args: { config: toStandard, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectNoLeak(root, '345');
    for (const k of ['3', '4', '5']) await userEvent.click(key(root, k));
    await expect(within(root).getByRole('button', { name: 'Your answer: 345' })).toBeVisible();
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 345 });
    endFrame();
  },
};

/** To standard, four digits in an unusual order (5 + 3000 + 400 → 3405), typed on the keyboard. */
export const ToStandardUnusualOrder: Story = {
  args: { config: toStandardUnusual, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectNoLeak(root, '3405');
    await expectFits(canvasElement, root);
    await userEvent.keyboard('3405');
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 3405 });
  },
};

// ---------- words ----------

/**
 * Words with four long options (G2 reading): tapping a card speaks it and picks it (ink ring plus
 * check badge, never colour alone); answers the option id as a `choice`.
 */
export const WordsChoice: Story = {
  args: { config: wordsChoice, tier: 'abstract' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expectFits(canvasElement, root);
    // The question is the number: it shows large above the word cards.
    const number = canvas.getByRole('button', { name: '3405' });
    await expect(number).toBeVisible();
    await expect(number.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      (root.querySelector('.ni-efw__options') as HTMLElement).getBoundingClientRect().top,
    );
    await expectNumeralsAtLeast32(root, '.ni-efw__number');
    const options = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(options).toHaveLength(4);
    for (const o of options) await expectTargetSize(o, 'g1-up');
    await expectTargetGaps(options);
    const pick = canvas.getByRole('button', { name: 'three thousand four hundred five' });
    await userEvent.click(pick);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.ef.story.w3405', undefined);
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
    await expect(pick.querySelector('.ni-pick__badge')).not.toBeNull();
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'b' });
    await expect(steps(args.onInteract)).toEqual(['tap:opt-b']);
    endFrame();
  },
};

/**
 * The words-heard question never shows its number: not in text, accessible names (every button,
 * pad keys aside) or attributes. The number lives in the speech only.
 */
async function expectHeardNumberHidden(root: HTMLElement, answer: string) {
  await expectNoLeak(root, answer);
  // Computed accessible names (pad keys are single digits, so they never match a whole number).
  const named = new RegExp(answer);
  for (const role of ['button', 'group', 'img', 'status']) {
    await expect(within(root).queryAllByRole(role, { name: named }), role).toHaveLength(0);
  }
}

/**
 * Words heard (no word cards, PV.13.t3 "Listen to the number. Then tap it in."): pressing the big
 * speaker says the number (only the number, so nothing clips it); the child types it on the pad.
 */
export const WordsHear: Story = {
  args: { config: wordsHear, tier: 'abstract' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectHeardNumberHidden(root, '345');
    const speaker = within(root).getByRole('button', { name: 'Hear the number' });
    await expectTargetSize(speaker, 'g1-up');
    await userEvent.click(speaker);
    await expect(audio.sayPhrases).toHaveBeenCalledTimes(1);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 345 }]);
    await expect(audio.say).not.toHaveBeenCalled();
    // Hearing it changes nothing on screen: the number is still nowhere to read.
    await expectHeardNumberHidden(root, '345');
    for (const k of ['3', '4', '5']) await userEvent.click(key(root, k));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 345 });
    await expect(steps(args.onInteract)).toEqual([
      'tap:hear',
      'tap:key-3',
      'tap:key-4',
      'tap:key-5',
    ]);
  },
};

/**
 * Words heard in K mode (a K child, 11 to 59): the speaker is icon-only and K-sized; pressing it
 * says just the number, never its label first (K buttons otherwise speak their label).
 */
export const WordsHearK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: { ...wordsHear, target: 34 } satisfies Config,
    tier: 'abstract',
  },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectHeardNumberHidden(root, '34');
    const speaker = within(root).getByRole('button', { name: 'Hear the number' });
    await expectTargetSize(speaker, 'k');
    await expect(speaker).not.toHaveTextContent('Hear');
    await userEvent.click(speaker);
    await expect(audio.sayPhrases).toHaveBeenCalledTimes(1);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 34 }]);
    await expect(audio.say).not.toHaveBeenCalled();
    await expectHeardNumberHidden(root, '34');
    for (const k of ['3', '4']) await userEvent.click(key(root, k));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 34 });
  },
};

// ---------- digit-value ----------

/**
 * Digit value on four digits: the 4 in 3475 is ringed and underlined (not colour alone). Its value
 * (400) and its place name appear nowhere; the child types 400.
 */
export const DigitValue: Story = {
  args: { config: digitValue, tier: 'abstract' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectFits(canvasElement, root);
    await expectNoLeak(root, '400');
    await expectNoLeak(root, 'hundred');
    // One number; its accessible name says which digit is ringed, never what it is worth.
    const number = within(root).getByRole('button', { name: '3475, with 4 in the ring' });
    const ringed = number.querySelector('.ni-efw__nd[data-ringed="true"]') as HTMLElement;
    await expect(ringed).toHaveTextContent('4');
    await expect(ringed).toHaveAttribute('data-digit', '1');
    // Ring and underline: a shape change, not just a tint.
    await expect(getComputedStyle(ringed).boxShadow).not.toBe('none');
    await expect(getComputedStyle(ringed, '::after').content).not.toBe('none');
    await expectNumeralsAtLeast32(root, '.ni-efw__number');
    await expectTargetSize(number, 'g1-up');
    // The digits outside the ring stay tight (7 then 5).
    const [, , seven, five] = [...number.querySelectorAll('.ni-efw__nd')].map((d) =>
      d.getBoundingClientRect(),
    );
    await expect(Math.abs((five as DOMRect).left - (seven as DOMRect).right)).toBeLessThanOrEqual(
      2,
    );
    // Tapping speaks the whole number, never the ringed digit's value.
    await userEvent.click(number);
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 3475 }]);
    await expect(steps(args.onInteract)).toEqual(['tap:number']);
    for (const k of ['4', '0', '0']) await userEvent.click(key(root, k));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 400 });
  },
};

// ---------- stress, disabled ----------

/**
 * Stress: the largest build (3405 from eight cards, distractors included), part way: the child
 * has made 3000 + 400 + 5 and left the distractors (300, 40, 50, 4000, 500) in the tray. It fits
 * 1280 × 800 with nothing scrolled or clipped.
 */
export const Stress: Story = {
  args: { config: buildStress },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFits(canvasElement, root);
    const cards = trayCards(root);
    await expect(cards).toHaveLength(8);
    for (const c of cards) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(cards);
    await expectLinesAligned(cards);
    await expect(await expectOnesCueLegible(root, 'g1-up')).toBe(5);
    for (const v of [3000, 400, 5]) await tapPlace(root, v);
    await expect(await expectOnesCueLegible(root, 'g1-up')).toBe(5);
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['3000', '400', '5']);
    await expect(trayCards(root).map((c) => c.dataset.card)).toEqual([
      '300',
      '40',
      '50',
      '4000',
      '500',
    ]);
    await expectFits(canvasElement, root);
    await expectLinesAligned(matCards(root));
    await expectLinesAligned(trayCards(root));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [3000, 400, 5],
    });
    endFrame();
  },
};

// ---------- the supported domain's edges (engine: expanded-form.ts, domainIssues) ----------

/** Four blanks, one a place, for the largest target: □ + □ + □ + □ = 9999. */
const fillFour: Config = {
  format: 'expanded-form',
  target: 9999,
  mode: 'fill',
  expression: {
    tokens: [
      { t: 'blank', id: 'th' },
      { t: 'op', v: '+' },
      { t: 'blank', id: 'h' },
      { t: 'op', v: '+' },
      { t: 'blank', id: 't' },
      { t: 'op', v: '+' },
      { t: 'blank', id: 'o' },
      { t: 'rel', v: '=' },
      { t: 'num', v: 9999 },
    ],
  },
  unusualOrder: false,
};

/** Seventeen tokens: a three-digit sum grouped by place, as mda.addsub writes it. */
const groupedSum: Config = {
  format: 'expanded-form',
  target: 999,
  mode: 'to-standard',
  expression: {
    tokens: [
      { t: 'paren', v: '(' },
      { t: 'num', v: 500 },
      { t: 'op', v: '+' },
      { t: 'num', v: 400 },
      { t: 'paren', v: ')' },
      { t: 'op', v: '+' },
      { t: 'paren', v: '(' },
      { t: 'num', v: 50 },
      { t: 'op', v: '+' },
      { t: 'num', v: 40 },
      { t: 'paren', v: ')' },
      { t: 'op', v: '+' },
      { t: 'paren', v: '(' },
      { t: 'num', v: 5 },
      { t: 'op', v: '+' },
      { t: 'num', v: 4 },
      { t: 'paren', v: ')' },
    ],
  },
  unusualOrder: false,
};

/**
 * Seven cards (the most), each with the biggest picture of its place (nines and eights), one of
 * them five digits wide (a near miss one place past the target).
 */
const buildWide: Config = {
  format: 'expanded-form',
  target: 9999,
  mode: 'build',
  cards: [90_000, 9000, 900, 90, 9, 8000, 800],
  unusualOrder: false,
};

const efModel = () => {
  const model = formatModel('expanded-form');
  if (!model) throw new Error('no expanded-form model');
  return model;
};

/**
 * The widest fill the schema accepts: four blanks, each holding a four-digit number, typed on
 * the pad. Still fits 1280 × 800 with every blank full, and numerals stay 32 px or more.
 */
export const StressFillFourBlanks: Story = {
  args: { config: fillFour, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    await expect(efModel().configSchema.safeParse(fillFour).success).toBe(true);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expectFits(canvasElement, root);
    const typed = ['9000', '9000', '9000', '9000'];
    for (let i = 0; i < typed.length; i++) {
      const box = canvas.getByRole('button', { name: new RegExp(`^Box ${i + 1}:`) });
      if (box.getAttribute('aria-current') !== 'true') await userEvent.click(box);
      for (const k of typed[i] as string) await userEvent.click(key(root, k));
    }
    await expectFits(canvasElement, root);
    await expectNumeralsAtLeast32(root, '.ni-expr, .ni-efw__blank');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [9000, 9000, 9000, 9000],
    });
    endFrame();
  },
};

/** The longest expression the schema accepts (17 tokens) fits, numerals 32 px or more. */
export const StressGroupedSum: Story = {
  args: { config: groupedSum, tier: 'abstract' },
  play: async ({ canvasElement }) => {
    await expect(efModel().configSchema.safeParse(groupedSum).success).toBe(true);
    const root = await findWidget(canvasElement, ROOT);
    await expectFits(canvasElement, root);
    await expectNumeralsAtLeast32(root, '.ni-expr');
    for (const k of ['9', '9', '9']) await userEvent.click(key(root, k));
    await expectFits(canvasElement, root);
    endFrame();
  },
};

/** The widest tray the schema accepts, in the tray and then all on the mat. */
export const StressSevenWideCards: Story = {
  args: { config: buildWide },
  play: async ({ canvasElement }) => {
    await expect(efModel().configSchema.safeParse(buildWide).success).toBe(true);
    const root = await findWidget(canvasElement, ROOT);
    await expectFits(canvasElement, root);
    const cards = trayCards(root);
    await expect(cards).toHaveLength(7);
    for (const c of cards) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(cards);
    for (const v of buildWide.cards ?? []) await tapPlace(root, v);
    await expect(matCards(root)).toHaveLength(7);
    await expectFits(canvasElement, root);
    endFrame();
  },
};

/**
 * Every card of the largest build on the mat (the most it can hold): the mat wraps with each "+"
 * leading its card (no line ends with "+"), and the empty tray shows a soft dashed spot with an
 * arrow down, where cards can come back. Still fits 1280 × 800.
 */
export const StressAllCardsOnMat: Story = {
  args: { config: buildStress },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-efw__ghost[data-for="tray"]')).toBeNull();
    for (const v of [3000, 400, 5, 300, 40, 50, 4000, 500]) await tapPlace(root, v);
    await expect(matCards(root)).toHaveLength(8);
    await expect(root.querySelector('.ni-efw__ghost[data-for="tray"]')).not.toBeNull();
    await expectFits(canvasElement, root);
    await expectTargetGaps(matCards(root));
    await expectLinesAligned(matCards(root));
    // The mat wraps, but no line ends with "+": each "+" sits on its card's line.
    const lines = new Set(matCards(root).map((c) => Math.round(c.getBoundingClientRect().top)));
    await expect(lines.size).toBeGreaterThan(1);
    for (const plus of root.querySelectorAll<HTMLElement>('.ni-efw__plus')) {
      const card = plus.nextElementSibling as HTMLElement;
      await expect(card).toHaveClass('ni-efw__cardslot');
      const p = plus.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      await expect(p.top).toBeGreaterThanOrEqual(c.top);
      await expect(p.bottom).toBeLessThanOrEqual(c.bottom);
      await expect(p.right).toBeLessThan(c.left);
    }
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [3000, 400, 5, 300, 40, 50, 4000, 500],
    });
    endFrame();
  },
};

/**
 * Bank empty: 345 from exactly the cards 300, 40 and 5, all placed. The tray (the bank) is empty
 * and says so with an empty card spot and an arrow down (cards can come back here); nothing is
 * off: the cards on the mat are solid and "check" is ready.
 */
export const BankEmpty: Story = {
  args: {
    config: {
      format: 'expanded-form',
      target: 345,
      mode: 'build',
      cards: [300, 40, 5],
      unusualOrder: false,
    } satisfies Config,
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-efw__ghost[data-for="tray"]')).toBeNull();
    for (const v of [300, 40, 5]) await tapPlace(root, v);
    await expect(trayCards(root)).toHaveLength(0);
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['300', '40', '5']);
    // The cue is visible, full strength, inside the tray.
    const cue = root.querySelector('.ni-efw__ghost[data-for="tray"]') as HTMLElement;
    await expect(cue).toBeVisible();
    await expect(getComputedStyle(cue).opacity).toBe('1');
    const tray = pad(root, 'tray').getBoundingClientRect();
    const spot = cue.getBoundingClientRect();
    await expect(spot.top).toBeGreaterThanOrEqual(tray.top);
    await expect(spot.bottom).toBeLessThanOrEqual(tray.bottom);
    await expect(await expectOnesCueLegible(root, 'g1-up')).toBe(5);
    // Nothing reads as off: solid cards, an enabled check.
    for (const c of matCards(root)) {
      await expect(getComputedStyle(c).borderStyle).toBe('solid');
    }
    await expect(checkButton(root)).toBeEnabled();
    await expect(args.onResponse).not.toHaveBeenCalled();
    await expectFits(canvasElement, root);
    endFrame();
  },
};

/** `disabled`: cards, digits and check take no input, and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const card = trayCard(root, 300);
    await expect(card).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(card);
    await userEvent.click(pad(root, 'build'));
    await expect(matCards(root)).toHaveLength(0);
    await expect(within(root).getByRole('button', { name: '345' })).toBeDisabled();
    await expect(checkButton(root)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

// ---------- demo mode (03 §6.3) ----------

const playController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo play, every op: Pip flies 300, 40 and 5 onto the mat, pulses the tens digit, stacks the
 * cards, takes the 5 back and finally enters the whole answer.
 */
export const DemoPlay: Story = {
  args: { disabled: true, demo: playController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const v of [300, 40, 5])
      await playController.play({ op: 'place-card', args: { value: v } });
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['300', '40', '5']);
    const pulse = playController.play({ op: 'highlight-digit', args: { index: 1 } });
    await waitFor(() =>
      expect(root.querySelector('.ni-efw__nd[data-digit="1"]')).toHaveClass('ni-invite'),
    );
    await pulse;
    await expect(root.querySelector('.ni-efw__nd[data-digit="1"]')).not.toHaveClass('ni-invite');
    await playController.play({ op: 'stack-cards' });
    await expect(root.querySelector('.ni-efw__row--build')).toHaveAttribute('data-stacked', 'true');
    await playController.play({ op: 'place-card', args: { value: 5, remove: true } });
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['300', '40']);
    await expect(root.querySelector('.ni-efw__row--build')).not.toHaveAttribute('data-stacked');
    await playController.play({ op: 'answer', args: { values: [300, 40, 5] } });
    await expect(matCards(root).map((c) => c.dataset.card)).toEqual(['300', '40', '5']);
    await expect(trayCards(root).map((c) => c.dataset.card)).toEqual(['400', '30', '50']);
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** Demo invite (the child's turn, K): Pip's hand points at the 40 card, then at the mat. */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'place-card', args: { value: 40 } });
    await waitFor(() => expect(trayCard(root, 40)).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, trayCard(root, 40), root);
    inviteController.invite({ op: 'stack-cards' });
    await waitFor(() => expect(pad(root, 'build')).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, pad(root, 'build'), root);
    inviteController.invite({ op: 'highlight-digit', args: { index: 0 } });
    const digit = root.querySelector('.ni-efw__nd[data-digit="0"]') as HTMLElement;
    await expectHandOnDigit(root, digit);
    // The child acts: the invite clears.
    await tapPlace(root, 300);
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

/** Waits for Pip's one hand to settle on `target` (kit placement, checked by `expectPointerOn`). */
async function expectHandOn(root: HTMLElement, target: HTMLElement) {
  await waitFor(() => expect(target).toHaveClass('ni-invite'));
  await waitFor(() => expect(root.querySelectorAll('.ni-hand')).toHaveLength(1));
  await waitFor(() => expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, target, root));
}

/**
 * An invited digit is its own glyph, so the hand points up at it from just below: the ring is on
 * the digit, the kit places the hand on the strip under the numeral (`expectPointerOn`), the
 * fingertip is in the digit's column, and the hand leaves the digit's text box fully visible.
 */
async function expectHandOnDigit(root: HTMLElement, digit: HTMLElement) {
  await waitFor(() => expect(digit).toHaveClass('ni-invite'));
  await waitFor(() => expect(root.querySelectorAll('.ni-hand')).toHaveLength(1));
  const strip = digit.querySelector('.ni-efw__nd-tip') as HTMLElement;
  await waitFor(() => expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, strip, root));
  const svg = root.querySelector('.ni-hand svg') as SVGElement;
  const h = svg.getBoundingClientRect();
  const d = digit.getBoundingClientRect();
  const tipX = h.left + h.width * HAND_POINTER_TIP.up.x;
  await expect(tipX).toBeGreaterThanOrEqual(d.left);
  await expect(tipX).toBeLessThanOrEqual(d.right);
  const ink = digitInk(digit);
  const apart =
    h.right <= ink.left || ink.right <= h.left || h.bottom <= ink.top || ink.bottom <= h.top;
  await expect(apart, `hand ${h.top}–${h.bottom} clear of digit ink ${ink.top}–${ink.bottom}`).toBe(
    true,
  );
}

/**
 * The drawn digit's ink box on screen: its text box's baseline (top + the font's ascent) plus the
 * glyph's own ascent and descent, measured with the digit's computed font.
 */
function digitInk(digit: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(digit.firstChild as Node);
  const box = range.getBoundingClientRect();
  const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  const cs = getComputedStyle(digit);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = ctx.measureText(digit.firstChild?.textContent ?? '');
  const baseline = box.top + m.fontBoundingBoxAscent;
  return {
    left: box.left,
    right: box.right,
    top: baseline - m.actualBoundingBoxAscent,
    bottom: baseline + m.actualBoundingBoxDescent,
  };
}

const everyTargetController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo invite on every build target (G1 pictorial): a tray card, a placed card to take back, the
 * mat and a digit of the number. Each time the ring sits on the target and Pip's ONE hand hangs
 * below it, fingertip inside, glyphs clear, all inside the widget.
 */
export const DemoInviteEveryTarget: Story = {
  args: { demo: everyTargetController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    everyTargetController.invite({ op: 'answer', args: { values: [5, 40, 300] } });
    await expectHandOn(root, trayCard(root, 5));
    await tapPlace(root, 300);
    everyTargetController.invite({ op: 'place-card', args: { value: 300, remove: true } });
    await expectHandOn(root, matCards(root)[0] as HTMLElement);
    everyTargetController.invite({ op: 'place-card', args: { value: 50 } });
    await expectHandOn(root, trayCard(root, 50));
    everyTargetController.invite({ op: 'stack-cards' });
    await expectHandOn(root, pad(root, 'build'));
    everyTargetController.invite({ op: 'highlight-digit', args: { index: 2 } });
    const digit = root.querySelector('.ni-efw__nd[data-digit="2"]') as HTMLElement;
    await expectHandOnDigit(root, digit);
    everyTargetController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    await expectFits(canvasElement, root);
  },
};

const inviteWordsController: WidgetDemo = createDemoController({ strict: true });

/** Demo invite on a word card (words with options): the hand hangs below it, words clear. */
export const DemoInviteWords: Story = {
  args: { config: wordsChoice, tier: 'abstract', demo: inviteWordsController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const id of ['d', 'b']) {
      inviteWordsController.invite({ op: 'answer', args: { id } });
      await expectHandOn(root, root.querySelector(`.ni-pick[data-id="opt-${id}"]`) as HTMLElement);
    }
    await expectFits(canvasElement, root);
  },
};

const invitePadController: WidgetDemo = createDemoController({ strict: true });

/** Demo invite on the pad's lone answer box (digit value): the hand hangs below the box. */
export const DemoInvitePadBox: Story = {
  args: { config: digitValue, tier: 'abstract', demo: invitePadController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    invitePadController.invite({ op: 'answer', args: { value: 400 } });
    await expectHandOn(root, within(root).getByRole('button', { name: 'Your answer:' }));
    // Typed digits are the box's glyph: the hand moves clear of them.
    await userEvent.click(key(root, '4'));
    invitePadController.invite({ op: 'answer', args: { value: 400 } });
    await expectHandOn(root, within(root).getByRole('button', { name: 'Your answer: 4' }));
    invitePadController.invite({ op: 'highlight-digit', args: { index: 1 } });
    const digit = root.querySelector('.ni-efw__nd[data-digit="1"]') as HTMLElement;
    await expectHandOnDigit(root, digit);
    await expectFits(canvasElement, root);
  },
};

const fillRemoveController: WidgetDemo = createDemoController({ strict: true });

/**
 * A faded lesson clears a filled blank (fill with cards): the child fills box 1 with 40; Pip's
 * hand points at that box for `place-card {remove, blank: 'b0'}` (the child's own clear payload,
 * no value); playing it empties the box and flies the 40 back to the tray, submitting nothing.
 * A removal without a blank changes nothing, as in the model.
 */
export const DemoFillRemove: Story = {
  args: { config: fillCards, demo: fillRemoveController },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(trayCard(root, 40));
    await userEvent.click(pad(root, 'blank-b0'));
    const filled = canvas.getByRole('button', { name: 'Box 1: 40' });
    await expect(trayCard(root, 40)).toBeNull();
    const remove = { op: 'place-card', args: { remove: true, blank: 'b0' } } as const;
    fillRemoveController.invite(remove);
    await waitFor(() => expect(filled).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, filled, root);
    // A removal by value alone is not a fill removal: nothing moves, box 1 keeps its 40.
    await fillRemoveController.play({ op: 'place-card', args: { value: 40, remove: true } });
    await expect(canvas.getByRole('button', { name: 'Box 1: 40' })).toBeVisible();
    await expect(pad(root, 'blank-b1')).toHaveAttribute('data-empty', 'true');
    await fillRemoveController.play(remove);
    await expect(pad(root, 'blank-b0')).toHaveAttribute('data-empty', 'true');
    await expect(canvas.queryByRole('button', { name: 'Box 1: 40' })).toBeNull();
    await expect(trayCard(root, 40)).not.toBeNull();
    await expect(trayCards(root).map((c) => c.dataset.card)).toEqual(['40', '5', '4', '50']);
    await expect(root.querySelector('.ni-hand')).toBeNull();
    await expect(checkButton(root)).toBeDisabled();
    await expect(args.onResponse).not.toHaveBeenCalled();
    // Nothing is left to remove: the same invite points at nothing.
    fillRemoveController.invite(remove);
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

/** Blank ids are any string: these hold a double quote, a backslash and a bracket. */
const QUOTED_B0 = 'b"0\\';
const QUOTED_B1 = 'b\'1"]';
const fillQuotedIds: Config = {
  ...fillCards,
  expression: {
    tokens: [
      { t: 'num', v: 300 },
      { t: 'op', v: '+' },
      { t: 'blank', id: QUOTED_B0 },
      { t: 'op', v: '+' },
      { t: 'blank', id: QUOTED_B1 },
      { t: 'rel', v: '=' },
      { t: 'num', v: 345 },
    ],
  },
};

/** An element by exact attribute value (the story itself builds no selector from the ids). */
const byAttr = (root: HTMLElement, attr: string, value: string) =>
  [...root.querySelectorAll<HTMLElement>(`[${attr}]`)].find((e) => e.getAttribute(attr) === value);

const quotedRemoveController: WidgetDemo = createDemoController({ strict: true });

/**
 * The fill removal with blank ids holding quotes and a backslash (the schema allows any string):
 * the child fills box 1 with 40; the invite points at it; playing `{remove, blank}` resolves,
 * empties the box and returns the 40 to the tray; a demo placement then fills that box again.
 * Nothing is submitted.
 */
export const DemoFillRemoveQuotedId: Story = {
  args: { config: fillQuotedIds, demo: quotedRemoveController },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(trayCard(root, 40));
    await userEvent.click(byAttr(root, 'data-place-target', `blank-${QUOTED_B0}`) as HTMLElement);
    const filled = canvas.getByRole('button', { name: 'Box 1: 40' });
    await expect(filled.getAttribute('data-blank')).toBe(QUOTED_B0);
    const remove = { op: 'place-card', args: { remove: true, blank: QUOTED_B0 } } as const;
    quotedRemoveController.invite(remove);
    await expectHandOn(root, filled);
    await expect(quotedRemoveController.play(remove)).resolves.toBeUndefined();
    const box1 = byAttr(root, 'data-blank', QUOTED_B0) as HTMLElement;
    await expect(box1).toHaveAttribute('data-empty', 'true');
    await expect(canvas.queryByRole('button', { name: 'Box 1: 40' })).toBeNull();
    await expect(trayCards(root).map((c) => c.dataset.card)).toEqual(['40', '5', '4', '50']);
    await expect(root.querySelector('.ni-hand')).toBeNull();
    // A demo placement looks the blank up by the same id: it resolves and fills box 1.
    await expect(
      quotedRemoveController.play({ op: 'place-card', args: { value: 5 } }),
    ).resolves.toBeUndefined();
    await expect(canvas.getByRole('button', { name: 'Box 1: 5' })).toHaveAttribute(
      'data-blank',
      QUOTED_B0,
    );
    await expect(byAttr(root, 'data-blank', QUOTED_B1)).toHaveAttribute('data-empty', 'true');
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

const padRemoveController: WidgetDemo = createDemoController({ strict: true });

/**
 * The same removal on the pad (□ + □ + □ = 345): the child typed 300 and 40; the invite points at
 * box 2 and Pip erases it with the backspace key, so box 2 is empty and nothing is submitted.
 */
export const DemoFillRemovePad: Story = {
  args: { config: fillThree, tier: 'abstract', demo: padRemoveController },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    for (const k of ['3', '0', '0', '4', '0']) await userEvent.click(key(root, k));
    const box2 = canvas.getByRole('button', { name: 'Box 2: 40' });
    const remove = { op: 'place-card', args: { remove: true, blank: 't' } } as const;
    padRemoveController.invite(remove);
    await waitFor(() => expect(box2).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, box2, root);
    await padRemoveController.play(remove);
    await expect(canvas.getByRole('button', { name: 'Box 2:' })).toHaveAttribute(
      'data-empty',
      'true',
    );
    await expect(canvas.getByRole('button', { name: 'Box 1: 300' })).toBeVisible();
    await expect(root.querySelector('.ni-pad__key.ni-invite')).toBeNull();
    await expect(args.onResponse).not.toHaveBeenCalled();
    // The child carries on in the emptied box.
    await expect(canvas.getByRole('button', { name: 'Box 2:' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  },
};

const swapController: WidgetDemo = createDemoController({ strict: true });
let nextItem: () => void = () => {};

/** The lesson host: moving on to the next item unmounts this widget and mounts a fresh one. */
function ItemSwapHarness(args: WidgetHostProps) {
  const [item, setItem] = useState(1);
  nextItem = () => setItem((n) => n + 1);
  return (
    <div className="story-widget-stage">
      <WidgetHost {...args} itemKey={item} demo={swapController} />
    </div>
  );
}

/**
 * The host moves on while Pip is still placing a card: the widget unmounts before the move
 * commits, and the op's promise settles at once instead of waiting out its timers.
 */
export const DemoSettlesOnUnmount: Story = {
  args: { disabled: true },
  render: (args) => <ItemSwapHarness {...args} />,
  play: async ({ canvasElement }) => {
    const first = await findWidget(canvasElement, ROOT);
    const playing = swapController.play({ op: 'place-card', args: { value: 300 } });
    nextItem(); // same tick: the widget unmounts before the placement commits
    const outcome = await Promise.race([
      playing.then(() => 'settled'),
      new Promise((r) => setTimeout(() => r('hung'), 2500)),
    ]);
    await expect(outcome).toBe('settled');
    // Settled by the unmount: the old item is gone (checked by the effect, never by the clock).
    await expect(first.isConnected).toBe(false);
    // The next item starts fresh: the old item's card never landed on its mat.
    const root = await findWidget(canvasElement, ROOT);
    await expect(canvasElement.querySelectorAll(ROOT)).toHaveLength(1);
    await expect(matCards(root)).toHaveLength(0);
    await expect(trayCards(root)).toHaveLength(6);
  },
};

const unsupportedController: WidgetDemo = createDemoController({ strict: true });

/** An op the format doesn't define throws `UnsupportedWidgetOpError` (development). */
export const DemoUnsupportedOp: Story = {
  args: { disabled: true, demo: unsupportedController },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(unsupportedController.ops).toEqual([
      'place-card',
      'stack-cards',
      'highlight-digit',
      'answer',
    ]);
    await expect(unsupportedController.play({ op: 'drag' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });
const reducedDigitController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: every op is an instant state change plus a highlight. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Instant: each effect is on screen as soon as its op resolves (no waiting, no clock).
    await reducedController.play({ op: 'answer', args: { values: [300, 40, 5] } });
    await expect(matCards(root)).toHaveLength(3);
    await expect(pad(root, 'build')).toHaveClass('ni-invite');
    await reducedController.play({ op: 'stack-cards' });
    await reducedController.play({ op: 'place-card', args: { value: 5, remove: true } });
    await reducedController.play({ op: 'place-card', args: { value: 5 } });
    await expect(trayCard(root, 5)).toBeNull();
    await expect(matCards(root)[2]).toHaveClass('ni-invite');
    await reducedController.play({ op: 'highlight-digit', args: { index: 2 } });
    // The ring stays (no pulse) until the next step.
    await expect(root.querySelector('.ni-efw__nd[data-digit="2"]')).toHaveClass('ni-invite');
  },
};

/** Reduced motion on the pad: `answer` types the digit's value at once. */
export const ReducedMotionPad: Story = {
  globals: { motion: 'reduced' },
  args: { config: digitValue, tier: 'abstract', disabled: true, demo: reducedDigitController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await reducedDigitController.play({ op: 'answer', args: { value: 400 } });
    await expect(within(root).getByRole('button', { name: 'Your answer: 400' })).toHaveClass(
      'ni-invite',
    );
  },
};
