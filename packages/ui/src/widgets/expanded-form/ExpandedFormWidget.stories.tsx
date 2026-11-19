import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
import type { WidgetHostProps } from '../WidgetHost';

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

/** The largest build: 3,405 from eight cards, distractors included. */
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

/** Words heard (no word cards): a big speaker button, then type the number on the pad. */
export const WordsHear: Story = {
  args: { config: wordsHear, tier: 'abstract' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectNoLeak(root, '345');
    const speaker = within(root).getByRole('button', { name: 'Hear the number' });
    await expectTargetSize(speaker, 'g1-up');
    await userEvent.click(speaker);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.ef.hear', undefined);
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
    await waitFor(() => expect(digit).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, digit, root);
    // The child acts: the invite clears.
    await tapPlace(root, 300);
    await expect(root.querySelector('.ni-hand')).toBeNull();
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
    const started = performance.now();
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
    await expect(performance.now() - started).toBeLessThan(1500);
  },
};

/** Reduced motion on the pad: `answer` types the digit's value at once. */
export const ReducedMotionPad: Story = {
  globals: { motion: 'reduced' },
  args: { config: digitValue, tier: 'abstract', disabled: true, demo: reducedDigitController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedDigitController.play({ op: 'answer', args: { value: 400 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(within(root).getByRole('button', { name: 'Your answer: 400' })).toHaveClass(
      'ni-invite',
    );
  },
};
