import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import { expectAreaFit, inArea } from '../../test-support/twoStepStory';
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
 * `number-pad` (03 §5.5, 06 §4): a picture or an expression with blanks, and the 3 × 4 pad.
 * One blank answers `number`; several answer `numbers` in reading order.
 */

const addition: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  expression: {
    tokens: [
      { t: 'num', v: 1 },
      { t: 'op', v: '+' },
      { t: 'num', v: 5 },
      { t: 'rel', v: '=' },
      { t: 'blank', id: 'x' },
    ],
  },
  blanks: [{ id: 'x', maxDigits: 2 }],
  unit: null,
};

const countPicture: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: {
    kind: 'objects',
    set: { count: 7, sprite: 'shell', layout: 'line', layoutSeed: 1509539769 },
  },
  blanks: [{ id: 'n', maxDigits: 2 }],
  unit: null,
};

const twoBlanks: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: {
    kind: 'number-line',
    min: 84,
    max: 89,
    ticksEvery: 1,
    labelsEvery: null,
    marks: [
      { at: 85, label: '85' },
      { at: 86, label: '?' },
      { at: 87, label: '?' },
      { at: 88, label: '88' },
    ],
  },
  expression: {
    tokens: [
      { t: 'num', v: 85 },
      { t: 'blank', id: 't1' },
      { t: 'blank', id: 't2' },
      { t: 'num', v: 88 },
    ],
  },
  blanks: [
    { id: 't1', maxDigits: 2 },
    { id: 't2', maxDigits: 2 },
  ],
  unit: null,
};

const decimal: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  blanks: [{ id: 'len', maxDigits: 3, allowDecimal: true }],
  unit: 'cm',
};

const spokenOnly: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  blanks: [{ id: 'n', maxDigits: 2 }],
  unit: null,
};

const meta = {
  title: 'Widgets/Number pad',
  args: {
    config: addition as WidgetConfig,
    tier: 'abstract',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-npw';
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;

/** Abstract: 1 + 5 = □. Tap 6, then check: one `number` response and a tap trace. */
export const Expression: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const check = canvas.getByRole('button', { name: 'Check' });
    // Never submits on partial input (06 §4): check stays off until the blank has a number.
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '6'));
    await expect(canvas.getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:key-6']);
    // 06 §4 sizes: every key ≥ 64 px (G1+), ≥ 12 px apart.
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    await expect(keys).toHaveLength(11);
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
  },
};

/** Pictorial, K mode: count the shells and type the number. Keys are K-sized (≥ 80 px) and speak. */
export const PictureCountK: Story = {
  globals: { ageMode: 'k' },
  args: { config: countPicture, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('img', { name: 'Look at the picture' })).toBeVisible();
    await expect(root.querySelectorAll('[data-sprite="shell"]')).toHaveLength(7);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'k');
    await expectTargetGaps(keys);
    // No decimal key: the bottom row is a wide 0 under 7–8 and backspace under 9, no empty cell.
    await expect(keys.map((k) => k.dataset.key)).toEqual([
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'back'],
    ]);
    const k7 = key(root, '7').getBoundingClientRect();
    const k9 = key(root, '9').getBoundingClientRect();
    const k0 = key(root, '0').getBoundingClientRect();
    const kBack = key(root, 'back').getBoundingClientRect();
    await expect(Math.abs(k0.left - k7.left)).toBeLessThan(1);
    await expect(Math.abs(kBack.right - k9.right)).toBeLessThan(1);
    await expect(kBack.left - k0.right).toBeGreaterThanOrEqual(11.5);
    await userEvent.click(key(root, '7'));
    // Tapping a number speaks its name (06 §5).
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 7 }]);
    // K: the check button is an icon with a spoken label.
    const check = within(root).getByRole('button', { name: 'Check' });
    await expectTargetSize(check, 'k');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
  },
};

/**
 * Two blanks (85, □, □, 88): typing fills the first blank, then moves to the next; tapping a
 * blank chooses it. Answers `numbers` in reading order.
 */
export const TwoBlanks: Story = {
  args: { config: twoBlanks, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(key(root, '8'));
    await userEvent.click(key(root, '6'));
    await expect(canvas.getByRole('button', { name: 'Box 1: 86' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Box 2:' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(key(root, '8'));
    await userEvent.click(key(root, '8'));
    // Oops: go back to box 2 and fix it.
    await userEvent.click(key(root, 'back'));
    await userEvent.click(key(root, '7'));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [86, 87] });
    // Tap box 1 to make it the active blank again.
    await userEvent.click(canvas.getByRole('button', { name: 'Box 1: 86' }));
    await expect(canvas.getByRole('button', { name: 'Box 1: 86' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const trace = traceOf(args.onInteract);
    await expect(trace.at(-1)).toMatchObject({ t: 'tap', target: 'blank-t1' });
    await expectTraceOrdered(trace);
  },
};

/** Desktop keyboard (06 §1): digits, Backspace and Enter work without touching the pad. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Enter on an empty answer does nothing and must not start the debounce window: the real
    // answer right after it still goes through.
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('9');
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenLastCalledWith({ kind: 'number', value: 9 });
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    (args.onResponse as ReturnType<typeof fn>).mockClear();
    await userEvent.keyboard('{Backspace}');
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.keyboard('1');
    await userEvent.keyboard('2');
    await userEvent.keyboard('{Backspace}');
    await userEvent.keyboard('7');
    await expect(within(root).getByRole('button', { name: 'Your answer: 17' })).toBeVisible();
    // A double Enter (or a held key) and Enter-then-Check inside 400 ms submit once (06 §4).
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 17 });
    // After the debounce window, Enter submits again.
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(2);
    // The pad keys are reachable by Tab and work with Enter/Space too.
    await userEvent.keyboard('{Backspace}{Backspace}');
    key(root, '4').focus();
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: 'Your answer: 4' })).toBeVisible(),
    );
  },
};

/** A decimal key appears only when the blank allows it; units show beside the blank. */
export const DecimalWithUnit: Story = {
  args: { config: decimal, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(key(root, '.')).not.toBeNull();
    await userEvent.click(key(root, '2'));
    await userEvent.click(key(root, '.'));
    await userEvent.click(key(root, '5'));
    await expect(within(root).getByText('cm')).toBeVisible();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 2.5 });
  },
};

/** The question is only heard (no picture): a big answer slot and the pad. No decimal key. */
export const SpokenOnly: Story = {
  args: { config: spokenOnly, tier: 'abstract' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(key(root, '.')).toBeNull();
    await expect(within(root).getByRole('button', { name: 'Your answer:' })).toBeVisible();
  },
};

/** `disabled`: no input at all (feedback showing, or the runner waiting). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(key(root, '3')).toBeDisabled();
    await userEvent.keyboard('3');
    await expect(within(root).getByRole('button', { name: 'Your answer:' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3): Pip types the answer key by key, then invites the child's step. */
export const DemoMode: Story = {
  args: { config: twoBlanks, tier: 'pictorial', disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'type', args: { blank: 't1', value: 86 } });
    await expect(within(root).getByRole('button', { name: 'Box 1: 86' })).toBeVisible();
    await demoController.play({ op: 'highlight', args: { token: 't2' } });
    await demoController.play({ op: 'show-stimulus' });
    await expect(demoController.play({ op: 'flash' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'type', args: { blank: 't2', value: 87 } });
    await waitFor(() => expect(root.querySelector('.ni-npw__blank.ni-invite')).not.toBeNull());
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      root.querySelector('.ni-npw__blank.ni-invite') as HTMLElement,
      root,
    );
  },
};

/** Blank IDs are any string (the shared schema): one is empty, one holds quotes and a backslash. */
const quotedBlanks: ConfigFor<'number-pad'> = {
  ...twoBlanks,
  expression: {
    tokens: [
      { t: 'num', v: 85 },
      { t: 'blank', id: '' },
      { t: 'blank', id: 'b"]\\2' },
      { t: 'num', v: 88 },
    ],
  },
  blanks: [
    { id: '', maxDigits: 2 },
    { id: 'b"]\\2', maxDigits: 2 },
  ],
};

const quotedController: WidgetDemo = createDemoController({ strict: true });

/**
 * Blanks whose IDs hold a quote or are empty (any string is a valid ID): inviting each rings that
 * blank and Pip's hand points at it; the widget stays mounted.
 */
export const DemoInviteQuotedId: Story = {
  args: { config: quotedBlanks, tier: 'pictorial', demo: quotedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    quotedController.invite({ op: 'type', args: { blank: 'b"]\\2', value: 87 } });
    await waitFor(() => expect(root.querySelector('.ni-npw__blank.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-npw__blank.ni-invite') as HTMLElement;
    await expect(invited.dataset.blank).toBe('b"]\\2');
    await expect(root.isConnected).toBe(true);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, invited, root);
    // The empty ID: ring and hand on the first blank.
    quotedController.invite({ op: 'type', args: { blank: '', value: 86 } });
    await waitFor(() =>
      expect(root.querySelector('.ni-npw__blank.ni-invite')).toHaveAttribute('data-blank', ''),
    );
    const first = root.querySelector('.ni-npw__blank.ni-invite') as HTMLElement;
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, first, root);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: the generic `answer` op fills every blank at once. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: twoBlanks, tier: 'pictorial', disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'answer', args: { values: [86, 87] } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(within(root).getByRole('button', { name: 'Box 2: 87' })).toBeVisible();
    // `answer` replaces every entry, like the engine model: a shorter answer clears box 2.
    await reducedController.play({ op: 'answer', args: { value: 85 } });
    await expect(within(root).getByRole('button', { name: 'Box 1: 85' })).toBeVisible();
    await expect(within(root).getByRole('button', { name: 'Box 2:' })).toBeVisible();
  },
};

// ---------- in the workshop's widget area (#12: nothing scrolls, Check always in view) ----------

/** The controls and parts of a number-pad widget, for `expectAreaFit`. */
const areaFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => ({
  ageMode,
  story,
  controls: {
    keys: [...root.querySelectorAll('.ni-pad__key')],
    blanks: [...root.querySelectorAll('.ni-npw__blank')],
    check: [within(root).getByRole('button', { name: 'Check' })],
  },
  parts: [...root.querySelectorAll('.ni-npw__stimulus, .ni-npw__expr')],
});

/** A picture over an expression, as ADD.02 plays it in K: seven shells and `4 + 3 = □`. */
const pictureSum: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'ten-frame', frames: 1, filled: [7] },
  expression: {
    tokens: [
      { t: 'num', v: 4 },
      { t: 'op', v: '+' },
      { t: 'num', v: 3 },
      { t: 'rel', v: '=' },
      { t: 'blank', id: 'x' },
    ],
  },
  blanks: [{ id: 'x', maxDigits: 2 }],
  unit: null,
};

/**
 * The smallest area (906 × 373) in K: a 3 × 4 pad of 80 px keys is 372 px tall, so the pad turns
 * 4 × 3 with Check beside it, and the picture takes the height the expression leaves.
 */
export const LandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: pictureSum, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, areaFit(root, 'k', 'number-pad 906x373 K'));
    await expect(root.querySelector('.ni-pad')).toHaveAttribute('data-shape', '4x3');
    // The same task: type 7, check, one `number` response.
    await userEvent.click(key(root, '7'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
  },
};

/** The smallest area from Grade 1: the 3 × 4 pad of 64 px keys with Check beside it. */
export const LandscapeMinG1: Story = {
  args: { config: twoBlanks, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, areaFit(root, 'g1-up', 'number-pad 906x373 G1'));
    await expect(root.querySelector('.ni-pad')).toHaveAttribute('data-shape', '3x4');
  },
};

/** The tablet area (1226 × 493) in K: the 3 × 4 pad of big keys, Check beside it. */
export const TabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: countPicture, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, areaFit(root, 'k', 'number-pad tablet K'));
    await expect(root.querySelector('.ni-pad')).toHaveAttribute('data-shape', '3x4');
  },
};

// ---------- equal shares that look different (FRA.16): a grid cut into parts ----------

/** FRA.16.t2's widest: an 8 × 2 grid in fourths, two 2 × 2 squares and two 4 × 1 bars. */
const gridEight: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: {
    kind: 'grid-parts',
    cols: 8,
    rows: 2,
    parts: [
      [0, 1, 8, 9],
      [2, 3, 10, 11],
      [4, 5, 6, 7],
      [12, 13, 14, 15],
    ],
  },
  blanks: [{ id: 'x', maxDigits: 2 }],
};
/** FRA.16.t2's tallest: a 4 × 4 grid in fourths, two bars below and two squares above. */
const gridSquare: ConfigFor<'number-pad'> = {
  ...gridEight,
  stimulus: {
    kind: 'grid-parts',
    cols: 4,
    rows: 4,
    parts: [
      [0, 1, 4, 5],
      [2, 3, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ],
  },
};

/**
 * Every square ≥ 22 px, parts told apart by a thick edge, no number on a part; the name gives
 * each part's shape and the squares along its sides.
 */
async function expectGridParts(root: HTMLElement, name: string) {
  const svg = root.querySelector<SVGSVGElement>('svg.ni-grid-parts') as SVGSVGElement;
  await expect(svg).toHaveAttribute('aria-label', name);
  await expect(svg.querySelector('text')).toBeNull();
  // The drawn square (the picture may be scaled to its box): every one at least 22 px.
  const scale = svg.getBoundingClientRect().width / Number(svg.getAttribute('width'));
  await expect(Number(svg.dataset.squarePx) * scale).toBeGreaterThanOrEqual(22);
}

const eightName =
  'A grid of 2 rows of 8 squares, cut into 4 parts: a square 2 squares wide and 2 tall, a square 2 squares wide and 2 tall, a bar 4 squares long, a bar 4 squares long.';

export const GridPartsLandscapeMin: Story = {
  args: { config: gridEight, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectGridParts(root, eightName);
    await expectAreaFit(canvasElement, areaFit(root, 'g1-up', 'number-pad grid-parts 906x373'));
    await userEvent.click(key(root, '4'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
  },
};

export const GridPartsTallLandscapeMin: Story = {
  args: { config: gridSquare, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectGridParts(
      root,
      'A grid of 4 rows of 4 squares, cut into 4 parts: a square 2 squares wide and 2 tall, a square 2 squares wide and 2 tall, a bar 4 squares long, a bar 4 squares long.',
    );
    await expectAreaFit(canvasElement, areaFit(root, 'g1-up', 'number-pad grid-parts tall'));
  },
};

export const GridPartsTablet: Story = {
  args: { config: gridEight, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectGridParts(root, eightName);
    await expectAreaFit(canvasElement, areaFit(root, 'g1-up', 'number-pad grid-parts tablet'));
  },
};

// ---------- equivalent fractions (FRA.05, K02 slice 5c): two strips and a box in a fraction ----------

/** FRA.05.t1's finest: three fourths over a strip in eighths, 3/4 = [ ]/8. */
const twoStrips: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: {
    kind: 'fraction',
    shape: 'bar',
    parts: 4,
    shaded: 3,
    equalParts: true,
    below: { parts: 8, shaded: 0 },
  },
  expression: {
    tokens: [
      { t: 'frac', a: 3, b: 4 },
      { t: 'rel', v: '=' },
      { t: 'frac', a: 'blank', b: 8 },
    ],
  },
  blanks: [{ id: 'frac-2-a', maxDigits: 1 }],
  unit: null,
};

const twoStripsName =
  'Two strips of the same length, one above the other. The top strip is in 4 equal parts, 3 of them shaded. The bottom strip is in 8 equal parts, 0 of them shaded.';

/**
 * Both strips one length, height and left edge (equal shaded lengths line up), each eighth at
 * least 22 px; named by both strips, never as equal; the box is drawn once, inside the fraction.
 */
export const TwoStripsLandscapeMin: Story = {
  args: { config: twoStrips, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('[data-two-strips="true"]')).toHaveAttribute(
      'aria-label',
      twoStripsName,
    );
    const [top, bottom] = [
      ...root.querySelectorAll<SVGElement>('.ni-stimulus--two-strips svg'),
    ].map((s) => s.getBoundingClientRect()) as [DOMRect, DOMRect];
    await expect(Math.abs(top.width - bottom.width)).toBeLessThan(1);
    await expect(Math.abs(top.left - bottom.left)).toBeLessThan(1);
    await expect(bottom.width / 8).toBeGreaterThanOrEqual(22);
    await expect(root.querySelectorAll('.ni-npw__blank')).toHaveLength(1);
    await expect(root.querySelector('.ni-npw__answers')).toBeNull();
    await expectAreaFit(canvasElement, areaFit(root, 'g1-up', 'number-pad two strips 906x373'));
    await userEvent.click(key(root, '6'));
    await expect(within(root).getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
  },
};

/** FRA.05.t4: a missing bottom number, 2/3 = 4/[ ], no picture. */
export const FractionBottomBox: Story = {
  args: {
    config: {
      format: 'number-pad',
      stimulus: {
        kind: 'expression',
        expr: {
          tokens: [
            { t: 'frac', a: 2, b: 3 },
            { t: 'rel', v: '=' },
            { t: 'frac', a: 4, b: 'blank' },
          ],
        },
      },
      blanks: [{ id: 'frac-2-b', maxDigits: 1 }],
      unit: null,
    },
    tier: 'abstract',
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-npw__blank')).toHaveLength(1);
    await expect(root.querySelector('.ni-expr__frac [data-blank="frac-2-b"]')).not.toBeNull();
    await userEvent.click(key(root, '6'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
  },
};
