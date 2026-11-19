import type { StimulusSpec, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectAreaCentred,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
  waitForSettled,
} from '../../test-support/storyHelpers';
import {
  areaBox,
  expectFill,
  expectFitsArea,
  expectPointerOn,
  expectRingClear,
  expectTraceOrdered,
  findWidget,
  inArea,
  noteMeasure,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `compare` (03 §5.5): two framed sides and one question. Pick a side or "the same" (more,
 * fewer, longer, heavier), "the same" / "not the same", a symbol between the sides (`<` `=` `>`),
 * or yes / no for a statement. On the concrete tier with `allowMatchLines` the sets show as rows
 * and the child may pair objects with lines first (help, never the answer). Fixtures follow 03
 * §5.5 and the shared schema samples (`packages/shared/src/items.test.ts`).
 */

type Config = ConfigFor<'compare'>;

const fish = (count: number, layoutSeed: number): StimulusSpec => ({
  kind: 'objects',
  set: { count, sprite: 'fish', layout: 'line', layoutSeed },
});
const numeral = (v: number): StimulusSpec => ({
  kind: 'expression',
  expr: { tokens: [{ t: 'num', v }] },
});

/** CMP.01 (concrete): 5 fish or 7 fish, which has more? Match lines allowed. */
const matchMore: Config = {
  format: 'compare',
  left: fish(5, 1),
  right: fish(7, 2),
  ask: 'more',
  allowMatchLines: true,
};

/** CMP.01 (pictorial): a ten-frame and dice dots, which has fewer? */
const fewerPictures: Config = {
  format: 'compare',
  left: { kind: 'ten-frame', frames: 1, filled: [6] },
  right: { kind: 'dots', arrangement: 'dice', groups: [4] },
  ask: 'fewer',
  allowMatchLines: false,
};

/** CMP.05: spread out versus bunched, the same or not? */
const sameOrNot: Config = {
  format: 'compare',
  // ALG.05.t2 (compare.sets `ask: same`, K, concrete): two lines of the same sprite, match lines.
  left: { kind: 'objects', set: { count: 6, sprite: 'shell', layout: 'line', layoutSeed: 7 } },
  right: { kind: 'objects', set: { count: 6, sprite: 'shell', layout: 'line', layoutSeed: 3 } },
  ask: 'same-or-not',
  allowMatchLines: true,
};

/** CMP.08 / PV.02: place <, = or > between two numbers. */
const symbol: Config = {
  format: 'compare',
  left: numeral(17),
  right: numeral(21),
  ask: 'symbol',
  allowMatchLines: false,
};

/** ADD.10: is 3 + 4 = 7 true? */
const trueFalse: Config = {
  format: 'compare',
  left: {
    kind: 'expression',
    expr: {
      tokens: [
        { t: 'num', v: 3 },
        { t: 'op', v: '+' },
        { t: 'num', v: 4 },
      ],
    },
  },
  right: numeral(7),
  ask: 'true-false',
  allowMatchLines: false,
};

/** CMP.07: two marks on number lines, which is more? */
const numberLines: Config = {
  format: 'compare',
  left: {
    kind: 'number-line',
    min: 10,
    max: 20,
    ticksEvery: 1,
    labelsEvery: 5,
    marks: [{ at: 14, arrow: true }],
  },
  right: {
    kind: 'number-line',
    min: 10,
    max: 20,
    ticksEvery: 1,
    labelsEvery: 5,
    marks: [{ at: 17, arrow: true }],
  },
  ask: 'more',
  allowMatchLines: false,
};

// Real content shapes (what the K01 generators build: compare.sets, compare.numbers, mea.length,
// mea.massvolume, geo.identify, equality).

/** CMP.01.t1 (K, concrete): 10 fish or 9 fish, which has more? Match lines allowed. */
const matchTen: Config = {
  format: 'compare',
  left: fish(10, 4),
  right: fish(9, 5),
  ask: 'more',
  allowMatchLines: true,
};

/** CMP.05.t1 (K, concrete): spread out and drawn big versus bunched; match lines allowed. */
const matchConflict: Config = {
  format: 'compare',
  left: {
    kind: 'objects',
    set: { count: 6, sprite: 'shell', layout: 'line', sizeVaries: true, layoutSeed: 9 },
  },
  right: {
    kind: 'objects',
    set: { count: 8, sprite: 'shell', layout: 'array', rows: 2, layoutSeed: 2 },
  },
  ask: 'more',
  allowMatchLines: true,
};

/** CMP.07.t1 (K, concrete): two double ten-frames, no match lines. */
const tenFrames: Config = {
  format: 'compare',
  left: { kind: 'ten-frame', frames: 2, filled: [10, 7] },
  right: { kind: 'ten-frame', frames: 2, filled: [10, 9] },
  ask: 'more',
  allowMatchLines: false,
};

/** CMP.05.t3 (K, pictorial): ten dots drawn big and spread out versus nine bunched. */
const dotsConflict: Config = {
  format: 'compare',
  left: {
    kind: 'objects',
    set: { count: 9, sprite: 'dot', layout: 'line', sizeVaries: true, layoutSeed: 3 },
  },
  right: {
    kind: 'objects',
    set: { count: 10, sprite: 'dot', layout: 'array', rows: 2, layoutSeed: 4 },
  },
  ask: 'fewer',
  allowMatchLines: false,
};

/** MEA.16.t2 (K): one object a side, which is heavier? */
const heavier: Config = {
  format: 'compare',
  left: { kind: 'objects', set: { count: 1, sprite: 'feather', layout: 'line', layoutSeed: 1 } },
  right: { kind: 'objects', set: { count: 1, sprite: 'pumpkin', layout: 'line', layoutSeed: 1 } },
  ask: 'heavier',
  allowMatchLines: false,
};

/** MEA.01.t3 (K): two ruler strips on one scale, which is longer? */
const strip = (at: number): StimulusSpec => ({
  kind: 'number-line',
  min: 0,
  max: 11,
  ticksEvery: 1,
  labelsEvery: null,
  marks: [{ at, arrow: true }],
});
const longer: Config = {
  format: 'compare',
  left: strip(7),
  right: strip(10),
  ask: 'longer',
  allowMatchLines: false,
};

/** PV.02.t3 (G1): marks on 0–100 lines, which is less? */
const hundredLine = (at: number): StimulusSpec => ({
  kind: 'number-line',
  min: 0,
  max: 100,
  ticksEvery: 10,
  labelsEvery: 50,
  marks: [{ at, label: String(at), arrow: true }],
});
const hundredLines: Config = {
  format: 'compare',
  left: hundredLine(58),
  right: hundredLine(85),
  ask: 'fewer',
  allowMatchLines: false,
};

/** PV.02.t1 (G1): base-ten blocks, which is more? */
const blocks = (tens: number, ones: number): StimulusSpec => ({
  kind: 'base-ten',
  hundreds: 0,
  tens,
  ones,
});
const baseTen: Config = {
  format: 'compare',
  left: blocks(7, 6),
  right: blocks(9, 8),
  ask: 'more',
  allowMatchLines: false,
};

/** GEO.08.t3 (K): which shape has more corners? (Shapes are drawn by U05; a card until then.) */
const shape = (kind: 'triangle' | 'square', sides: number): StimulusSpec => ({
  kind: 'shape',
  shapes: [
    {
      id: kind === 'triangle' ? 'left' : 'right',
      shape: kind,
      props: {
        sides,
        corners: sides,
        rightAngles: kind === 'square' ? 4 : 0,
        equalSides: true,
        parallelPairs: kind === 'square' ? 2 : 0,
        curved: false,
        closed: true,
        solid: false,
      },
      rotationDeg: 0,
      scale: 1,
      color: 'blue',
    },
  ],
});
const shapes: Config = {
  format: 'compare',
  left: shape('triangle', 3),
  right: shape('square', 4),
  ask: 'more',
  allowMatchLines: false,
};

/** Three-digit numbers, place a symbol. */
const symbolHundreds: Config = { ...symbol, left: numeral(105), right: numeral(150) };

/** CMP.08.t2 (G1): place a symbol between two marks on 0–20 lines. */
const markLine = (at: number): StimulusSpec => ({
  kind: 'number-line',
  min: 0,
  max: 20,
  ticksEvery: 1,
  labelsEvery: 5,
  marks: [{ at, label: String(at), arrow: true }],
});
const symbolLines: Config = {
  format: 'compare',
  left: markLine(13),
  right: markLine(9),
  ask: 'symbol',
  allowMatchLines: false,
};

const expr = (...tokens: (number | '+' | '-' | '=')[]): StimulusSpec => ({
  kind: 'expression',
  expr: {
    tokens: tokens.map((v) =>
      typeof v === 'number'
        ? ({ t: 'num', v } as const)
        : v === '='
          ? ({ t: 'rel', v: '=' } as const)
          : ({ t: 'op', v } as const),
    ),
  },
});

/** ADD.10.t4 (G1): a whole statement on the left, nothing on the right: true or not? */
const statement: Config = {
  format: 'compare',
  left: expr(6, '+', 7, '=', 3, '+', 10),
  right: { kind: 'none' },
  ask: 'true-false',
  allowMatchLines: false,
};

/** Expression against expression: which is more? */
const sums: Config = {
  format: 'compare',
  left: expr(8, '+', 5),
  right: expr(6, '+', 9),
  ask: 'more',
  allowMatchLines: false,
};

const meta = {
  title: 'Widgets/Compare',
  args: {
    config: fewerPictures as WidgetConfig,
    tier: 'pictorial',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Every story in a workshop area: the widget uses the room (its content covers ≥ 60 % of it).
  afterEach: async ({ canvasElement }) => {
    // The area card is centred in the stage on both axes (story harness, #92).
    await expectAreaCentred(canvasElement);
    const box = canvasElement.querySelector<HTMLElement>('.story-widget-area');
    const root = canvasElement.querySelector<HTMLElement>('.ni-cmp');
    if (!box || !root) return;
    await expectFill(box, [
      ...root.querySelectorAll('.ni-cmp__stage, .ni-cmp__rows, .ni-cmp__answer'),
    ]);
  },
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-cmp';
const objects = (root: HTMLElement, side: 'left' | 'right') => [
  ...root.querySelectorAll<HTMLElement>(`.ni-cmp__row[data-side="${side}"] .ni-cmp__obj`),
];

/**
 * Concrete tier, K: pair fish across the rows (each tap speaks "fish"), lines join them; then pick
 * the bottom row ("this one") and check. Objects are K-sized and ≥ 12 px apart.
 */
export const MatchLinesK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: matchMore, tier: 'concrete' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const left = objects(root, 'left');
    const right = objects(root, 'right');
    await expect(left).toHaveLength(5);
    await expect(right).toHaveLength(7);
    for (const o of [...left, ...right]) await expectTargetSize(o, 'k');
    await expectTargetGaps(left);
    await expectTargetGaps(right);
    await userEvent.click(left[0] as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.fish', undefined);
    await expect(left[0]).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(right[0] as HTMLElement);
    // Bottom row first also works.
    await userEvent.click(right[1] as HTMLElement);
    await userEvent.click(left[1] as HTMLElement);
    await waitFor(() => expect(root.querySelectorAll('.ni-cmp__line')).toHaveLength(2));
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    const picks = canvas.getAllByRole('button', { name: /^This one/ });
    // Measured exactly (no rounding): a K target, ≥ 80 px both ways.
    for (const p of picks) {
      const r = p.getBoundingClientRect();
      await expect(r.width).toBeGreaterThanOrEqual(80);
      await expect(r.height).toBeGreaterThanOrEqual(80);
    }
    await expect(picks).toHaveLength(2);
    for (const p of picks) await expectTargetSize(p, 'k');
    await userEvent.click(picks[1] as HTMLElement);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:left-obj-0',
      'tap:right-obj-0',
      'move:match-0-0',
      'tap:right-obj-1',
      'tap:left-obj-1',
      'move:match-1-1',
      'tap:right',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Pictorial, G1: tap the side with fewer (an ink ring and a check badge), then check. */
export const FewerPictorial: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const left = canvas.getByRole('button', { name: 'Left side' });
    const right = canvas.getByRole('button', { name: 'Right side' });
    const same = canvas.getByRole('button', { name: 'The same' });
    for (const b of [left, right, same]) await expectTargetSize(b, 'g1-up');
    await expectTargetGaps([left, right, same]);
    await userEvent.click(left);
    await userEvent.click(right);
    await expect(right).toHaveAttribute('aria-pressed', 'true');
    await expect(left).toHaveAttribute('aria-pressed', 'false');
    await expect(right.querySelector('.ni-pick__badge')).not.toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['left', 'right']);
  },
};

/** "The same" answers `same` for a side question. */
export const SameAnswer: Story = {
  args: { config: { ...fewerPictures, right: { kind: 'dots', arrangement: 'dice', groups: [6] } } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(canvas.getByRole('button', { name: 'The same' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'same' });
  },
};

/** K: the same, or not the same? Icon cards only (= and ≠), spoken labels. */
export const SameOrNotK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: sameOrNot, tier: 'concrete' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    // The sets are rows to match (the real ALG.05.t2 item): tidy lines, one cell, no side picks.
    await expect(root).toHaveAttribute('data-mode', 'match');
    await expect(canvas.queryByRole('button', { name: 'Left side' })).toBeNull();
    const same = canvas.getByRole('button', { name: 'The same' });
    const notSame = canvas.getByRole('button', { name: 'Not the same' });
    await expect(root.querySelector('.ni-cmp__caption')).toBeNull();
    for (const b of [same, notSame]) await expectTargetSize(b, 'k');
    await expectTargetGaps([same, notSame]);
    await userEvent.click(notSame);
    await expect(audio.say).toHaveBeenCalledWith('ui.compare.not-same', undefined);
    await userEvent.click(same);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'same' });
  },
};

/** Abstract, G1: tap a symbol and it goes into the gap between the numbers. */
export const SymbolTap: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  parameters: { ui: { audio: spyAudio() } },
  args: { config: symbol, tier: 'abstract' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const tiles = ['Less than', 'Equal to', 'Greater than'].map((n) =>
      canvas.getByRole('button', { name: n }),
    );
    for (const tile of tiles) await expectTargetSize(tile, 'g1-up');
    await expectTargetGaps(tiles);
    await userEvent.click(tiles[2] as HTMLElement);
    await userEvent.click(tiles[0] as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.compare.less', undefined);
    await waitFor(() =>
      expect(root.querySelector('.ni-cmp__gap')).toHaveAttribute('data-filled', 'true'),
    );
    await expect(root.querySelector('.ni-cmp__placed [data-glyph="lt"]')).not.toBeNull();
    await expect(canvas.getByRole('button', { name: 'Less than' })).toHaveAttribute(
      'data-chosen',
      'true',
    );
    // The committed symbol is announced (pressed); the others are not.
    await expect(canvas.getByRole('button', { name: 'Less than' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const name of ['Equal to', 'Greater than']) {
      await expect(canvas.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: '<' });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:>',
      'tap:<',
    ]);
  },
};

/** Drag a symbol into the gap with the mouse, then another with a finger (touch). */
export const SymbolDrag: Story = {
  args: { config: symbol, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const pad = root.querySelector('.ni-cmp__pad') as HTMLElement;
    await pointerDrag(canvas.getByRole('button', { name: 'Greater than' }), center(pad), 'mouse');
    await waitFor(() =>
      expect(root.querySelector('.ni-cmp__placed [data-glyph="gt"]')).not.toBeNull(),
    );
    await pointerDrag(canvas.getByRole('button', { name: 'Less than' }), center(pad), 'touch');
    await waitFor(() =>
      expect(root.querySelector('.ni-cmp__placed [data-glyph="lt"]')).not.toBeNull(),
    );
    // A drop away from the gap changes nothing.
    await pointerDrag(canvas.getByRole('button', { name: 'Equal to' }), { x: 10, y: 10 }, 'mouse');
    await expect(root.querySelector('.ni-cmp__placed [data-glyph="lt"]')).not.toBeNull();
    await expect(canvas.getByRole('button', { name: 'Less than' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByRole('button', { name: 'Equal to' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: '<' });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:>',
      'drop:gap',
      'drag:<',
      'drop:gap',
      'drag:=',
      'drop:none',
    ]);
  },
};

/** Keyboard (06 §7): Enter on a symbol places it; Enter on check answers. */
export const SymbolKeyboard: Story = {
  args: { config: symbol, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    // Check before any symbol sends nothing and does not start the 400 ms window.
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }), {
      pointerEventsCheck: 0,
    });
    await expect(args.onResponse).not.toHaveBeenCalled();
    canvas.getByRole('button', { name: 'Less than' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('button', { name: 'Equal to' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(root.querySelector('.ni-cmp__placed [data-glyph="eq"]')).not.toBeNull(),
    );
    await expect(canvas.getByRole('button', { name: 'Equal to' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const check = canvas.getByRole('button', { name: 'Check' });
    check.focus();
    // A double Enter and a Check tap inside 400 ms answer once (06 §4).
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: '=' });
  },
};

/** Keyboard on a side question: Tab to a side, Space picks it, Tab on to check. */
export const SidesKeyboard: Story = {
  args: { config: numberLines, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    canvas.getByRole('button', { name: 'Left side' }).focus();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Right side' })).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(canvas.getByRole('button', { name: 'Right side' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.tab();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Check' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
  },
};

/**
 * Tapping operands speaks them (06 §5) and never answers: the numbers of a symbol question (each
 * side a button that only speaks), and a side pick names its objects.
 */
export const OperandSpeechK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: symbolHundreds, tier: 'abstract' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const left = canvas.getByRole('button', { name: 'Left side: 105' });
    const right = canvas.getByRole('button', { name: 'Right side: 150' });
    for (const b of [left, right]) await expectTargetSize(b, 'k');
    await userEvent.click(left);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 105 }]);
    await userEvent.click(right);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 150 }]);
    // Speaking is all: nothing is chosen, Check stays off, the trace has the taps.
    await expect(root.querySelector('.ni-cmp__placed')).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:side-left',
      'tap:side-right',
    ]);
    // The symbol tiles still answer.
    await userEvent.click(canvas.getByRole('button', { name: 'Less than' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: '<' });
  },
};

/** Same or not (K): an objects side is a button that names its objects; it never answers. */
export const OperandObjectsK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  // At the 960 × 600 minimum the rows don't fit: the sides are pictures that only speak.
  args: { config: sameOrNot, tier: 'concrete' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(root).toHaveAttribute('data-mode', 'sides');
    await expectCompareFits(canvasElement, root, 'k');
    await userEvent.click(canvas.getByRole('button', { name: 'Left side: Shell' }));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.shell', undefined);
    await expect(canvas.getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['side-left']);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/**
 * A number-line side speaks only a labelled mark: an unlabelled mark's value is what the child is
 * asked to read, so tapping that side picks it and says nothing; a labelled mark speaks its number.
 */
export const LineSidesSpeechK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: numberLines, tier: 'pictorial' },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const left = within(root).getByRole('button', { name: 'Left side' });
    await userEvent.click(left);
    await expect(left).toHaveAttribute('aria-pressed', 'true');
    await expect(audio.say).not.toHaveBeenCalled();
    await expect(audio.sayPhrases).not.toHaveBeenCalled();
    await expect(audio.sayText).not.toHaveBeenCalled();
  },
};

/** A labelled mark (0–100 lines) speaks its number when its side is tapped. */
export const LabelledLineSpeechK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: hundredLines, tier: 'pictorial' },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(within(root).getByRole('button', { name: 'Left side: 58' }));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 58 }]);
  },
};

/** Tapping a side that is a number speaks it (06 §5). */
export const NumeralSidesK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: { ...symbol, ask: 'more' }, tier: 'abstract' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(canvas.getByRole('button', { name: 'Right side: 21' }));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 21 }]);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
  },
};

/**
 * True or not? 3 + 4 = 7: yes (thumb up) or no (thumb down), with text labels from G1. The
 * thumbs never repeat the Check button's tick.
 */
export const TrueFalse: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  args: { config: trueFalse, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(root.querySelector('.ni-cmp__relation [data-glyph="eq"]')).not.toBeNull();
    const yes = canvas.getByRole('button', { name: 'Yes' });
    const no = canvas.getByRole('button', { name: 'No' });
    await expect(yes).toHaveTextContent('Yes');
    await expect(yes.querySelector('[data-glyph="thumb-up"]')).not.toBeNull();
    await expect(no.querySelector('[data-glyph="thumb-down"]')).not.toBeNull();
    await expectTargetGaps([yes, no]);
    await userEvent.click(no);
    await userEvent.click(yes);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'true' });
  },
};

/** `disabled`: nothing responds. */
export const Disabled: Story = {
  args: { disabled: true, config: symbol, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(canvas.getByRole('button', { name: 'Less than' }), {
      pointerEventsCheck: 0,
    });
    await expect(root.querySelector('.ni-cmp__placed')).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3): Pip points at each row, draws a match line, picks the answer. While the
 * host keeps input off, an invite shows nothing (the child can't act yet).
 */
export const DemoMode: Story = {
  globals: { ageMode: 'k' },
  args: { disabled: true, config: matchMore, tier: 'concrete', demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { side: 'left' } });
    await demoController.play({ op: 'match', args: { left: 0, right: 0 } });
    await waitFor(() => expect(root.querySelectorAll('.ni-cmp__line')).toHaveLength(1));
    await demoController.play({ op: 'answer', args: { id: 'right' } });
    await expect(
      within(root).getAllByRole('button', { name: /^This one/ })[1] as HTMLElement,
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(demoController.play({ op: 'drag' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'match', args: { left: 1, right: 1 } });
    await new Promise((r) => setTimeout(r, 100));
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const symbolController: WidgetDemo = createDemoController({ strict: true });

/** Demo: Pip slides `<` from its tile into the gap. */
export const DemoPlaceSymbol: Story = {
  args: { disabled: true, config: symbol, tier: 'abstract', demo: symbolController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await symbolController.play({ op: 'place-symbol', args: { symbol: '<' } });
    await expect(root.querySelector('.ni-cmp__placed [data-glyph="lt"]')).not.toBeNull();
    await expect(root.querySelector('.ni-cmp__flight')).toBeNull();
  },
};

/** Every target a child can use: picks, choices, symbols, objects, the gap, check. */
const targets = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>(
    '.ni-pick, .ni-cmp__obj, .ni-cmp__operand, .ni-cmp__pad, .ni-cmp__check .ni-btn',
  ),
];

/** ONE ring, on `el`; Pip's fingertip on it at rest; the ring ≥ 12 px clear of every other target. */
async function expectInviteOn(root: HTMLElement, el: HTMLElement) {
  await waitFor(() => expect(el).toHaveClass('ni-invite'));
  await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
  await waitFor(() => expect(root.querySelectorAll('.ni-hand')).toHaveLength(1));
  await waitForSettled(el);
  await new Promise((r) => requestAnimationFrame(r));
  await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, el, root);
  await expectRingClear(
    el,
    targets(root).filter((t) => t !== el),
  );
}

const noInvite = async (root: HTMLElement) => {
  await waitFor(() => expect(root.querySelector('.ni-invite')).toBeNull());
  await expect(root.querySelector('.ni-hand')).toBeNull();
};

const obj = (root: HTMLElement, id: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-obj]')].find(
    (el) => el.dataset.obj === id,
  ) as HTMLElement;

const matchInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn (03 §6.3), `match {left, right}` in match mode: the ring and Pip's hand on the
 * left object; once the child taps it, on the right one; once they are joined (a straight line:
 * object 1 above object 1), nothing. `answer {id: same}` rings "the same"; the faded example then
 * moves on to `highlight {side}`: the ring and the hand on the bottom row's "this one" card, where
 * the story ends (nothing picked yet, one ring).
 */
export const InviteMatchK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  args: { config: matchMore, tier: 'concrete', demo: matchInvite },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-mode', 'match');
    await waitForSettled(root);
    // The layout before any invite: every invite below leaves it exactly as it is.
    const before = layoutOf(root);
    matchInvite.invite({ op: 'match', args: { left: 1, right: 1 } });
    await expectInviteOn(root, obj(root, 'left-obj-1'));
    await userEvent.click(obj(root, 'left-obj-1'));
    await expectInviteOn(root, obj(root, 'right-obj-1'));
    await userEvent.click(obj(root, 'right-obj-1'));
    await waitFor(() => expect(root.querySelectorAll('.ni-cmp__line')).toHaveLength(1));
    const line = root.querySelector('.ni-cmp__line line') as SVGLineElement;
    await expect(Number(line.getAttribute('x1'))).toBeCloseTo(Number(line.getAttribute('x2')), 0);
    await noInvite(root);
    matchInvite.invite({ op: 'answer', args: { id: 'same' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'The same' }));
    matchInvite.invite({ op: 'highlight', args: { side: 'right' } });
    const picks = within(root).getAllByRole('button', { name: /^This one/ });
    await expectInviteOn(root, picks[1] as HTMLElement);
    await expect(root.querySelector('[aria-pressed="true"]')).toBeNull();
    // The invite on the bottom row's "this one" moved nothing (Pip's hand uses room the layout
    // already has), and the hand stays ≥ 12 px inside the panel.
    await expectSameLayout(before, layoutOf(root));
    await expectHandInsideArea(canvasElement, root);
    // End on what the child sees: the one invite (no leftover focus ring from the taps).
    (document.activeElement as HTMLElement | null)?.blur();
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

const sideInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Side questions on pictures: `highlight {side}` and `answer {id}` ring the side card; a question
 * where the sides are not targets (same or not) gets no side cue.
 */
export const InviteSides: Story = {
  args: { config: numberLines, tier: 'pictorial', demo: sideInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    sideInvite.invite({ op: 'highlight', args: { side: 'left' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'Left side' }));
    sideInvite.invite({ op: 'answer', args: { id: 'right' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'Right side' }));
    // A match invite has no object targets here (pictures): no cue.
    sideInvite.invite({ op: 'match', args: { left: 0, right: 0 } });
    await noInvite(root);
    // Following an invite ends it: the side picked, no ring left.
    sideInvite.invite({ op: 'answer', args: { id: 'right' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'Right side' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Right side' }));
    await noInvite(root);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

const sameInvite: WidgetDemo = createDemoController({ strict: true });

/** Same or not: a side is never a target, so `highlight {side}` shows nothing. */
export const InviteSameOrNotK: Story = {
  globals: { ageMode: 'k' },
  args: { config: sameOrNot, demo: sameInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    sameInvite.invite({ op: 'answer', args: { id: 'not-same' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'Not the same' }));
    sameInvite.invite({ op: 'highlight', args: { side: 'left' } });
    await noInvite(root);
  },
};

const symbolInvite: WidgetDemo = createDemoController({ strict: true });

/** `place-symbol {symbol}` and `answer {id}` ring that symbol tile. */
export const InviteSymbol: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  args: { config: symbol, tier: 'abstract', demo: symbolInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitForSettled(root);
    const before = layoutOf(root);
    symbolInvite.invite({ op: 'place-symbol', args: { symbol: '=' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'Equal to' }));
    symbolInvite.invite({ op: 'answer', args: { id: '<' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'Less than' }));
    // Pip's hand under the bottom row uses room the layout holds for it: nothing moved, and the
    // hand stays ≥ 12 px inside the panel's border.
    await expectSameLayout(before, layoutOf(root));
    await expectHandInsideArea(canvasElement, root);
    // The invite is the child's turn: one ring and Pip's hand, nothing chosen, the gap empty.
    for (const name of ['Less than', 'Equal to', 'Greater than']) {
      await expect(within(root).getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    await expect(root.querySelector('.ni-pick__badge')).toBeNull();
    await expect(root.querySelector('.ni-cmp__placed')).toBeNull();
    await expect(root.querySelector('.ni-cmp__gap')).not.toHaveAttribute('data-filled');
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: ops are instant state changes. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, config: symbol, tier: 'abstract', demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'place-symbol', args: { symbol: '>' } });
    await reducedController.play({ op: 'answer', args: { id: '=' } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(root.querySelector('.ni-cmp__placed [data-glyph="eq"]')).not.toBeNull();
  },
};

// ---------- real content shapes ----------

/** Every side picture sits inside its side's frame. */
async function expectPicturesInside(root: HTMLElement) {
  for (const side of root.querySelectorAll<HTMLElement>('.ni-cmp__side')) {
    const frame = (side.querySelector('.ni-cmp__tray') as HTMLElement).getBoundingClientRect();
    const pic = (
      side.querySelector('.ni-fitpic, .ni-cmp__strip') as HTMLElement
    ).getBoundingClientRect();
    await expect(pic.left).toBeGreaterThanOrEqual(frame.left);
    await expect(pic.right).toBeLessThanOrEqual(frame.right + 0.5);
    await expect(pic.top).toBeGreaterThanOrEqual(frame.top);
    await expect(pic.bottom).toBeLessThanOrEqual(frame.bottom + 0.5);
  }
}

/** CMP.05.t1 (K, concrete): match rows keep the picture's look (big and spread versus bunched). */
export const MatchConflictK: Story = {
  globals: { ageMode: 'k' },
  args: { config: matchConflict, tier: 'concrete' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-mode', 'match');
    const all = [...root.querySelectorAll<HTMLElement>('.ni-cmp__obj')];
    await expect(all).toHaveLength(14);
    for (const o of all) await expectTargetSize(o, 'k');
    await expectTargetGaps(all);
  },
};

/** CMP.07.t1 (K, concrete): two double ten-frames, sides to pick. */
export const TenFramesK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  args: { config: tenFrames, tier: 'concrete' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-mode', 'sides');
    await expectPicturesInside(root);
    // Both sides share one cell: the frames are the same size.
    const frames = [...root.querySelectorAll<HTMLElement>('.ni-objects__frame')];
    await expect(frames).toHaveLength(4);
    const w = frames.map((f) => Math.round(f.getBoundingClientRect().width));
    await expect(new Set(w).size).toBe(1);
    await userEvent.click(within(root).getByRole('button', { name: 'Right side' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
  },
};

/** CMP.05.t3 (K): the bigger-looking side has fewer; both drawn on one cell. */
export const DotsConflictK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  args: { config: dotsConflict, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInside(root);
    const cells = [...root.querySelectorAll<HTMLElement>('.ni-objects')].map((o) =>
      getComputedStyle(o).getPropertyValue('--cell'),
    );
    await expect(new Set(cells).size).toBe(1);
    // The conflict cue is deliberate: every dot of the big-looking side (9, left) is larger than
    // every dot of the bunched side (10, right), and the big side's dots are spread wider.
    const dots = (side: 'left' | 'right') =>
      [...root.querySelectorAll(`.ni-cmp__side[data-side="${side}"] .ni-objects__item`)].map((d) =>
        d.getBoundingClientRect(),
      );
    const big = dots('left');
    const small = dots('right');
    await expect(big).toHaveLength(9);
    await expect(small).toHaveLength(10);
    await expect(Math.min(...big.map((d) => d.width))).toBeGreaterThan(
      Math.max(...small.map((d) => d.width)),
    );
    const gap = (ds: DOMRect[]) => (ds[1]?.left ?? 0) - (ds[0]?.right ?? 0);
    await expect(gap(big)).toBeGreaterThan(gap(small));
  },
};

/** MEA.16.t2 (K): heavier, one object a side. */
export const HeavierK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  args: { config: heavier, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInside(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Right side' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
  },
};

/** MEA.01.t3 (K): two ruler strips, which is longer? */
export const LongerK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  args: { config: longer, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInside(root);
    // Two strips one above the other, from one start, on one scale: lengths in proportion.
    await expect(root.getAttribute('data-arrange')).toMatch(/^stack/);
    const ribbon = (side: 'left' | 'right') =>
      (
        root.querySelector(`.ni-cmp__side[data-side="${side}"] .ni-cmp__ribbon rect`) as Element
      ).getBoundingClientRect();
    const a = ribbon('left');
    const b = ribbon('right');
    await expect(Math.abs(a.left - b.left)).toBeLessThan(1);
    await expect(a.width / b.width).toBeCloseTo(7 / 10, 2);
    // ONE ruler under both strips (0–11: all 12 ticks), its 0 exactly under the ribbons' start.
    await expect(root.querySelectorAll('.ni-cmp__ruler')).toHaveLength(1);
    await expect(root.querySelectorAll('.ni-cmp__side .ni-numberline__tick')).toHaveLength(0);
    const ticks = [...root.querySelectorAll('.ni-cmp__ruler .ni-numberline__tick')];
    await expect(ticks).toHaveLength(12);
    const zero = ticks[0]?.getBoundingClientRect() as DOMRect;
    await expect(Math.abs(zero.left + zero.width / 2 - a.left)).toBeLessThan(1.5);
    const ruler = (root.querySelector('.ni-cmp__ruler') as HTMLElement).getBoundingClientRect();
    await expect(ruler.top).toBeGreaterThan(Math.max(a.bottom, b.bottom));
  },
};

/**
 * GEO.08.t3 (K): which shape has more corners? Shapes render as the kit's neutral card until U05
 * draws them (kit README: shape drawing belongs to U05); the sides are still the pick targets.
 */
export const ShapesK: Story = {
  globals: { ageMode: 'k' },
  args: { config: shapes, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInside(root);
    await expect(within(root).getByRole('button', { name: 'Left side' })).toBeVisible();
  },
};

/** Expressions on both sides: which is more? */
export const SumsMore: Story = {
  args: { config: sums, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInside(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Right side' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
  },
};

/** CMP.08.t2 (G1): a symbol between marks on two lines. */
export const SymbolLines: Story = {
  args: { config: symbolLines, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInside(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Greater than' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: '>' });
  },
};

// ---------- the workshop's widget area (06 §1, §2) ----------

/**
 * Stacked sides keep their objects in column, as match rows do: the same left edge and one cell,
 * so object i sits above object i and the longer row's extra object stands out at its end.
 */
async function expectRowsInColumn(root: HTMLElement) {
  const rows = [...root.querySelectorAll<HTMLElement>('.ni-cmp__side')].map((side) =>
    [...side.querySelectorAll('.ni-objects__item')].map((o) => o.getBoundingClientRect()),
  );
  await expect(rows).toHaveLength(2);
  const [a, b] = rows as [DOMRect[], DOMRect[]];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    await expect(Math.abs((a[i] as DOMRect).left - (b[i] as DOMRect).left)).toBeLessThan(1);
  }
}

/**
 * Every drawn fish (its outline, not its cell) is at least `min` px wide, all one size; returns
 * the measured width.
 */
async function expectFish(root: HTMLElement, min: number): Promise<number> {
  const drawn = [...root.querySelectorAll('.ni-objects__item svg')].map((svg) => {
    const parts = [...svg.querySelectorAll('path')].map((p) => p.getBoundingClientRect());
    return Math.max(...parts.map((r) => r.right)) - Math.min(...parts.map((r) => r.left));
  });
  await expect(drawn.length).toBeGreaterThan(0);
  await expect(Math.max(...drawn) - Math.min(...drawn)).toBeLessThan(0.5);
  await expect(Math.min(...drawn), 'drawn fish width').toBeGreaterThanOrEqual(min);
  return Math.min(...drawn);
}

/**
 * Every base-ten side's DRAWN blocks (rods and cubes, not the picture's box) sit centred in its
 * card: left and right margins within 2 px of each other; returns them ("L/R" per side).
 */
async function expectBlocksCentred(root: HTMLElement): Promise<string> {
  const out: string[] = [];
  for (const side of root.querySelectorAll<HTMLElement>('.ni-cmp__side')) {
    const card = (side.querySelector('.ni-cmp__tray') as HTMLElement).getBoundingClientRect();
    const drawn = [...side.querySelectorAll('.ni-baseten__block, .ni-baseten__unit')].map((b) =>
      b.getBoundingClientRect(),
    );
    await expect(drawn.length).toBeGreaterThan(0);
    const left = Math.min(...drawn.map((b) => b.left)) - card.left;
    const right = card.right - Math.max(...drawn.map((b) => b.right));
    await expect(Math.abs(left - right), 'blocks centred in their card').toBeLessThanOrEqual(2);
    out.push(`${Math.round(left)}/${Math.round(right)}`);
  }
  return out.join(', ');
}

/** The boxes of everything a child sees and uses, to prove an invite moves none of them. */
const layoutOf = (root: HTMLElement) =>
  [
    ...root.querySelectorAll<HTMLElement>(
      '.ni-cmp__stage, .ni-cmp__rows, .ni-cmp__row, .ni-cmp__side, .ni-cmp__answer, .ni-pick, .ni-cmp__obj, .ni-cmp__pad, .ni-cmp__check',
    ),
  ].map((el) => {
    // Layout boxes, not drawn ones (an invite ring's pulse scales its control a little).
    let x = 0;
    let y = 0;
    for (
      let e: HTMLElement | null = el;
      e && e !== root;
      e = e.offsetParent as HTMLElement | null
    ) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    return [x, y, el.offsetWidth, el.offsetHeight];
  });

/** Nothing moved or resized: every box within 1 px of where it was. */
async function expectSameLayout(before: number[][], after: number[][]) {
  await expect(after).toHaveLength(before.length);
  for (let i = 0; i < before.length; i++) {
    for (let k = 0; k < 4; k++) {
      await expect(
        Math.abs((after[i]?.[k] ?? 0) - (before[i]?.[k] ?? 0)),
        `box ${i} unchanged by the invite`,
      ).toBeLessThanOrEqual(1);
    }
  }
}

/**
 * Pip's hand at rest, its bob included, stays ≥ 12 px inside the area card's border (the panel
 * the widget sits in); returns the clearance.
 */
async function expectHandInsideArea(canvasElement: HTMLElement, root: HTMLElement) {
  const loops = root
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const h = (root.querySelector('.ni-hand svg') as SVGElement).getBoundingClientRect();
    const box = areaBox(canvasElement);
    const b = box.getBoundingClientRect();
    const bw = Number.parseFloat(getComputedStyle(box).borderTopWidth);
    const clear = Math.min(
      h.left - 6 - (b.left + bw),
      b.right - bw - h.right,
      h.top - (b.top + bw),
      b.bottom - bw - (h.bottom + 8),
    );
    await expect(clear, 'the hand ≥ 12 px inside the panel border').toBeGreaterThanOrEqual(12);
    return clear;
  } finally {
    for (const a of loops) a.play();
  }
}

/** Every numeral a number line draws (tick and mark labels) is ≥ 32 CSS px as rendered (scaled). */
async function expectLineNumerals(root: HTMLElement) {
  const texts = [
    ...root.querySelectorAll<SVGTextElement>('.ni-numberline__numeral, .ni-numberline__marklabel'),
  ];
  await expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) {
    const svg = text.ownerSVGElement as SVGSVGElement;
    const scale = svg.getBoundingClientRect().width / svg.width.baseVal.value;
    const px = Number.parseFloat(text.getAttribute('font-size') ?? '0') * scale;
    await expect(px, `numeral ${text.textContent} size`).toBeGreaterThanOrEqual(32);
  }
}

/** The widget fits the area: no scroll, every part inside, every target full size and spaced. */
async function expectCompareFits(
  canvasElement: HTMLElement,
  root: HTMLElement,
  age: 'k' | 'g1-up',
) {
  await waitForSettled(root);
  await new Promise((r) => requestAnimationFrame(r));
  const parts = [
    root.querySelector('.ni-cmp__stage, .ni-cmp__rows'),
    root.querySelector('.ni-cmp__answer'),
  ].filter((p): p is HTMLElement => p !== null);
  await expectFitsArea(areaBox(canvasElement), parts, targets(root), age);
  const pictures = [...root.querySelectorAll('.ni-fitpic')];
  for (const p of pictures) {
    await expect(p.getBoundingClientRect().height).toBeGreaterThan(20);
  }
}

/**
 * K at the 960 × 600 minimum (852 × 319): 10 fish against 9 don't fit as two rows of full-size
 * targets with the answers, so the sides are pictures and are the pick targets (no object
 * targets: matching is optional help). The sides stack, each the full width beside the answers,
 * so the fish draw as big as the room allows (59 px cells, the drawn fish ≈ 47 px) and at one size
 * on both sides. Picking a side answers; nothing
 * scrolls.
 */
export const MatchTenFallbackKMin: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: matchTen, tier: 'concrete' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-mode', 'sides');
    await expect(root).toHaveAttribute('data-arrange', 'stack-beside');
    await expect(root.querySelector('.ni-cmp__obj')).toBeNull();
    await expectCompareFits(canvasElement, root, 'k');
    const cells = [...root.querySelectorAll('.ni-objects__item')].map((f) =>
      Math.round(f.getBoundingClientRect().width),
    );
    await expect(cells).toHaveLength(19);
    await expect(new Set(cells).size).toBe(1);
    // The drawn fish (its outline, not its cell), the real maximum here: two lines of ten
    // 1.12-cell steps across the side give a 59 px cell, and the fish art spans 51 of the cell's
    // 64 units, so each fish measures 47 px wide. The label quotes this measurement.
    const fish = await expectFish(root, 45);
    noteMeasure(canvasElement, 'fish', `fish ${fish.toFixed(0)} px wide, 10 + 9 in two lines`);
    await expectRowsInColumn(root);
    // Picking a side names its objects (06 §5).
    await userEvent.click(within(root).getByRole('button', { name: 'Left side' }));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.fish', undefined);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'left' });
  },
};

const fallbackInvite: WidgetDemo = createDemoController({ strict: true });

/** The fallback layout has no object targets: a match invite shows nothing; a side invite does. */
export const MatchTenFallbackKMinInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: matchTen, tier: 'concrete', demo: fallbackInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    fallbackInvite.invite({ op: 'match', args: { left: 0, right: 0 } });
    await noInvite(root);
    fallbackInvite.invite({ op: 'highlight', args: { side: 'left' } });
    await expectInviteOn(root, within(root).getByRole('button', { name: 'Left side' }));
  },
};

/** Tablet landscape (1226 × 493): 10 against 9 fish still fit as match rows, K-sized. */
export const MatchTenKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: matchTen, tier: 'concrete' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-mode', 'match');
    await expect(root.querySelectorAll('.ni-cmp__obj')).toHaveLength(19);
    await expectCompareFits(canvasElement, root, 'k');
  },
};

/**
 * Portrait (746 × 812): 10 fish don't fit a row at K size, so the sides are pictures, stacked.
 * Each line wraps into rows of five (10 = 5 + 5 above 9 = 5 + 4, still in column), so the fish
 * use the tall side cards: ≥ 75 px each, the fish block ≥ 70 % of its card's height.
 */
export const MatchTenKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: matchTen, tier: 'concrete' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
    await expectRowsInColumn(root);
    const fish = await expectFish(root, 75);
    const shares: number[] = [];
    for (const side of root.querySelectorAll<HTMLElement>('.ni-cmp__side')) {
      const rows = new Set(
        [...side.querySelectorAll('.ni-objects__item')].map((o) =>
          Math.round(o.getBoundingClientRect().top),
        ),
      );
      await expect(rows.size).toBe(2);
      const card = (side.querySelector('.ni-cmp__tray') as HTMLElement).getBoundingClientRect();
      const pic = (side.querySelector('.ni-fitpic') as HTMLElement).getBoundingClientRect();
      shares.push(pic.height / card.height);
    }
    await expect(Math.min(...shares)).toBeGreaterThanOrEqual(0.7);
    noteMeasure(
      canvasElement,
      'fish',
      `fish ${fish.toFixed(0)} px wide in rows of 5, ${Math.round(Math.min(...shares) * 100)} % of the card height`,
    );
  },
};

/** K at the minimum: three-digit numbers and the symbol gap. */
export const SymbolHundredsKMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: symbolHundreds, tier: 'abstract' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
    for (const n of root.querySelectorAll<HTMLElement>('.ni-expr')) {
      await expect(
        (Number.parseFloat(getComputedStyle(n).fontSize) *
          (n.closest('.ni-scaled__inner') as HTMLElement).getBoundingClientRect().width) /
          (n.closest('.ni-scaled__inner') as HTMLElement).offsetWidth,
      ).toBeGreaterThanOrEqual(32);
    }
    await userEvent.click(within(root).getByRole('button', { name: 'Less than' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: '<' });
  },
};

/** Portrait: the symbol question. */
export const SymbolHundredsKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: symbolHundreds, tier: 'abstract' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
  },
};

/** K at the minimum: a whole statement on the left alone, yes or no. */
export const StatementKMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: statement, tier: 'abstract' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-cmp__side')).toHaveLength(1);
    await expectCompareFits(canvasElement, root, 'k');
    await userEvent.click(within(root).getByRole('button', { name: 'Yes' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'true' });
  },
};

/**
 * K at the minimum: base-ten blocks on both sides, drawn at one scale (a ten is as tall on both
 * sides, so 76 never looks bigger than 98).
 */
export const BaseTenKMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: baseTen, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
    await expectPicturesInside(root);
    const rods = [...root.querySelectorAll('.ni-baseten__block--rod')].map((r) =>
      Math.round(r.getBoundingClientRect().height),
    );
    await expect(rods).toHaveLength(16);
    await expect(new Set(rods).size).toBe(1);
    await expectBlocksCentred(root);
  },
};

/** Tablet: base-ten blocks, each side's drawn blocks centred in its card. */
export const BaseTenKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: baseTen, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
    await expectPicturesInside(root);
    noteMeasure(canvasElement, 'margins', await expectBlocksCentred(root));
  },
};

/** One ten and one one (11) against two tens (20): a lone one or no ones still centre. */
export const BaseTenLoneOne: Story = {
  args: { config: { ...baseTen, left: blocks(1, 1), right: blocks(2, 0) }, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'g1-up');
    await expectBlocksCentred(root);
  },
};

/** K at the minimum: 0–100 number lines with labelled marks. */
export const NumberLinesKMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: hundredLines, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
    await expectPicturesInside(root);
    await expectLineNumerals(root);
  },
};

/** Portrait: number lines. */
export const NumberLinesKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: hundredLines, tier: 'pictorial' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
    await expectPicturesInside(root);
  },
};

/** Tablet: number lines. */
export const NumberLinesKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: hundredLines, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectCompareFits(canvasElement, root, 'k');
    await expectPicturesInside(root);
  },
};
