import type { StimulusSpec, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  expectTraceOrdered,
  findWidget,
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
  left: { kind: 'objects', set: { count: 6, sprite: 'shell', layout: 'scatter', layoutSeed: 7 } },
  right: { kind: 'objects', set: { count: 6, sprite: 'shell', layout: 'line', layoutSeed: 3 } },
  ask: 'same-or-not',
  allowMatchLines: false,
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
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: sameOrNot },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    // The sides are pictures, not buttons, for this question.
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

/** True or not? 3 + 4 = 7: yes (check) or no (cross), with text labels from G1. */
export const TrueFalse: Story = {
  args: { config: trueFalse, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(root.querySelector('.ni-cmp__relation [data-glyph="eq"]')).not.toBeNull();
    const yes = canvas.getByRole('button', { name: 'Yes' });
    const no = canvas.getByRole('button', { name: 'No' });
    await expect(yes).toHaveTextContent('Yes');
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
 * Demo mode (03 §6.3): Pip points at each row, draws a match line, picks the answer; the child's
 * next match is invited (pulse + hand).
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
    await waitFor(() =>
      expect(root.querySelector('[data-obj="left-obj-1"].ni-invite')).not.toBeNull(),
    );
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const symbolController: WidgetDemo = createDemoController({ strict: true });

/** Demo: Pip slides `<` from its tile into the gap; the child is invited to check `=`. */
export const DemoPlaceSymbol: Story = {
  args: { disabled: true, config: symbol, tier: 'abstract', demo: symbolController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await symbolController.play({ op: 'place-symbol', args: { symbol: '<' } });
    await expect(root.querySelector('.ni-cmp__placed [data-glyph="lt"]')).not.toBeNull();
    await expect(root.querySelector('.ni-cmp__flight')).toBeNull();
    symbolController.invite({ op: 'place-symbol', args: { symbol: '=' } });
    await waitFor(() => expect(root.querySelector('[data-symbol="="].ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
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
