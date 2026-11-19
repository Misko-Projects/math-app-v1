import type { PatternToken, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { center, clearSpies, pointerDrag, spyAudio } from '../../test-support/storyHelpers';
import { areaBox, expectFitsArea, inArea } from '../../test-support/widgetArea';
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
 * `pattern-extend` (03 §5.5): extend, fill, find the core, translate, find the rule, complete a
 * table. Drag a piece onto a blank (or tap the piece, then the blank; or the keyboard); number
 * blanks are typed on the pad. Check sends the engine model's response.
 *
 * Configs are real generated items (`generateItem(template, seed)` over the compiled catalog),
 * named by template and seed; tables (ALG.09), translations and growing tiles (ALG.10) are
 * hand-made (no generator yet, K02).
 */

type Config = ConfigFor<'pattern-extend'>;

const fish = { sprite: 'fish' };
const leaf = { sprite: 'leaf' };
const shell = { sprite: 'shell' };
const ySquare = { sprite: 'square', color: 'yellow' };
const bCircle = { sprite: 'circle', color: 'blue' };
const rCircle = { sprite: 'circle', color: 'red' };
const bSquare = { sprite: 'square', color: 'blue' };
const yTriangle = { sprite: 'triangle', color: 'yellow' };

/** ALG.01.t1 seed 1 (concrete): fish, leaf, fish, leaf, fish, _ → leaf. */
const objectsExtend: Config = {
  format: 'pattern-extend',
  sequence: [fish, leaf, fish, leaf, fish, null],
  palette: [fish, leaf],
  mode: 'extend',
  kind: 'repeat',
};

/** ALG.01.t2 seed 1: AABB shapes with the 6th hidden → yellow square. */
const shapesFill: Config = {
  format: 'pattern-extend',
  sequence: [ySquare, ySquare, bCircle, bCircle, ySquare, null, bCircle],
  palette: [ySquare, bCircle],
  mode: 'fill',
  kind: 'repeat',
};

/** ALG.01.t2 seed 2: AB shapes, the next two → red circle, blue square. */
const shapesExtend: Config = {
  format: 'pattern-extend',
  sequence: [rCircle, bSquare, rCircle, bSquare, rCircle, bSquare, null, null],
  palette: [rCircle, bSquare],
  mode: 'extend',
  kind: 'repeat',
};

/** ALG.04.t1 seed 1 (concrete): AABB, nine shown → the core is places 1–4. */
const objectsCore: Config = {
  format: 'pattern-extend',
  sequence: [shell, shell, fish, fish, shell, shell, fish, fish, shell],
  palette: [shell, fish],
  mode: 'core',
  kind: 'repeat',
};

/** ALG.04.t2 seed 2: AAB shapes, eight shown → the core is places 1–3. */
const shapesCore: Config = {
  format: 'pattern-extend',
  sequence: [ySquare, ySquare, bCircle, ySquare, ySquare, bCircle, ySquare, ySquare],
  palette: [ySquare, bCircle],
  mode: 'core',
  kind: 'repeat',
};

/** ALG.02.t3 seed 2 (abstract): 29, 30, 31, _, _ → 32, 33. */
const numbers: Config = {
  format: 'pattern-extend',
  sequence: [{ n: 29 }, { n: 30 }, { n: 31 }, null, null],
  palette: [],
  mode: 'extend',
  kind: 'number',
};

/** ALG.02.t4 seed 2: 15, 25, 35 — how much does it grow? (10). */
const rule: Config = {
  format: 'pattern-extend',
  sequence: [{ n: 15 }, { n: 25 }, { n: 35 }],
  palette: [],
  mode: 'rule',
  kind: 'number',
};

/** Hand-made (ALG.09): an add-2 machine, the last two outputs missing. */
const table: Config = {
  format: 'pattern-extend',
  sequence: [{ n: 1 }, { n: 3 }],
  palette: [],
  mode: 'table',
  kind: 'function',
  table: { inputs: [1, 2, 3, 4], outputs: [3, 4, null, null] },
};

/** Hand-made: rebuild shell, shell, fish (×2) with shapes. */
const translate: Config = {
  format: 'pattern-extend',
  sequence: [shell, shell, fish, shell, shell, fish],
  palette: [shell, fish],
  mode: 'translate',
  kind: 'repeat',
  translateTo: [rCircle, bSquare, yTriangle],
};

/** Hand-made (ALG.10): 1, 3, 5 tiles → build the next (7). */
const tiles: Config = {
  format: 'pattern-extend',
  sequence: [{ tiles: 1 }, { tiles: 3 }, { tiles: 5 }, null],
  palette: [],
  mode: 'extend',
  kind: 'grow',
};

const meta = {
  title: 'Widgets/Pattern extend',
  args: {
    config: objectsExtend as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-pattern';
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const cell = (root: HTMLElement, i: number, row: 'pattern' | 'new' = 'pattern') =>
  root.querySelector(`[data-row="${row}"] [data-index="${i}"]`) as HTMLElement;
const units = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-pattern__unit')];
const blanks = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-pattern__blank')];
const shownCells = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>(
    '[data-row="pattern"] button.ni-pattern__cell:not(.ni-pattern__blank)',
  ),
];
const padKeys = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];

/** The strip shows exactly the sequence: each shown unit in its place, a blank for each null. */
async function expectShowsSequence(root: HTMLElement, sequence: (PatternToken | null)[]) {
  for (const [i, token] of sequence.entries()) {
    const el = cell(root, i);
    await expect(el, `place ${i + 1}`).not.toBeNull();
    if (token === null) {
      await expect(el.classList.contains('ni-pattern__blank')).toBe(true);
    } else if ('n' in token) {
      await expect(el.textContent).toBe(String(token.n));
    } else if ('tiles' in token) {
      await expect(el.querySelectorAll('.ni-pattern__tile')).toHaveLength(token.tiles);
    } else if (token.color) {
      const svg = el.querySelector('[data-shape]');
      await expect(svg?.getAttribute('data-shape')).toBe(token.sprite);
      await expect(svg?.getAttribute('data-color')).toBe(token.color);
    } else {
      await expect(el.querySelector('[data-sprite]')?.getAttribute('data-sprite')).toBe(
        token.sprite,
      );
    }
  }
}

/**
 * K, concrete (ALG.01.t1 seed 1): the strip shows exactly fish, leaf, fish, leaf, fish and one
 * blank. Tap the leaf (spoken), tap the blank: it holds the leaf; Check answers it.
 */
export const ObjectsExtendKTablet: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('tablet'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, objectsExtend.sequence);
    await expect(check(root)).toBeDisabled();
    await userEvent.click(units(root)[1] as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.leaf', undefined);
    await userEvent.click(cell(root, 5));
    await expect(cell(root, 5).querySelector('[data-sprite]')?.getAttribute('data-sprite')).toBe(
      'leaf',
    );
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...units(root), check(root)],
      'k',
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [{ sprite: 'leaf' }] },
    });
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * K at the 960 × 600 minimum (ALG.01.t2 seed 1): touch-drag the yellow square into the gap. A
 * wrong piece can be taken off again by tapping the filled blank.
 */
export const ShapesFillTouchKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: shapesFill, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, shapesFill.sequence);
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...units(root), check(root)],
      'k',
    );
    const [square, circle] = units(root) as [HTMLElement, HTMLElement];
    await pointerDrag(circle, center(cell(root, 5)), 'touch');
    await expect(cell(root, 5).querySelector('[data-shape]')?.getAttribute('data-shape')).toBe(
      'circle',
    );
    await userEvent.click(cell(root, 5));
    await expect(cell(root, 5)).toHaveAttribute('data-empty', 'true');
    await pointerDrag(square, center(cell(root, 5)), 'touch');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [{ sprite: 'square', color: 'yellow' }] },
    });
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds).toContain('undo:blank-5');
    await expect(kinds.filter((k) => k.startsWith('drop:'))).toHaveLength(2);
  },
};

/** Keyboard (06 §7): Enter on a piece moves to the first blank, Enter places it; arrows move. */
export const ShapesExtendKeyboard: Story = {
  args: { config: shapesExtend, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const [red, blue] = units(root) as [HTMLElement, HTMLElement];
    red.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cell(root, 6)).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    blue.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowRight}');
    await expect(cell(root, 7)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    check(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [rCircle, bSquare] },
    });
  },
};

/**
 * K, find the core (ALG.04.t1 seed 1) at the 960 × 600 minimum: nine units wrap onto two even
 * rows. Tap the first unit, then the fourth: a band marks places 1–4; Check answers them.
 */
export const CoreTapKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: objectsCore },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, objectsCore.sequence);
    await expectFitsArea(areaBox(canvasElement), [...shownCells(root), check(root)], 'k');
    await userEvent.click(cell(root, 0));
    await expect(cell(root, 0)).toHaveAttribute('data-pending', 'true');
    await userEvent.click(cell(root, 3));
    await expect(
      [...root.querySelectorAll('[data-core]')].map((e) => e.getAttribute('data-index')),
    ).toEqual(['0', '1', '2', '3']);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [0, 1, 2, 3] },
    });
  },
};

/** Drag across the part that repeats (ALG.04.t2 seed 2): from the first unit to the third. */
export const CoreDrag: Story = {
  args: { config: shapesCore, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(cell(root, 0), center(cell(root, 2)), 'touch');
    await expect(
      [...root.querySelectorAll('[data-core]')].map((e) => e.getAttribute('data-index')),
    ).toEqual(['0', '1', '2']);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [0, 1, 2] },
    });
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds).toEqual(['drag:tok-0', 'drop:tok-2']);
  },
};

/**
 * Abstract number pattern (ALG.02.t3 seed 2) at the 960 × 600 minimum, G1: type 32 in the first
 * blank, tap the second, type 33 (each digit spoken); Check answers both.
 */
export const NumbersTypedLandscapeMin: Story = {
  args: { config: numbers, tier: 'abstract' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, numbers.sequence);
    for (const n of root.querySelectorAll('.ni-pattern__numeral')) {
      await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...padKeys(root), check(root)],
      'g1-up',
    );
    const pad = within(root.querySelector('.ni-pad') as HTMLElement);
    await userEvent.click(pad.getByRole('button', { name: '3' }));
    await userEvent.click(pad.getByRole('button', { name: '2' }));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 2 }]);
    await userEvent.click(cell(root, 4));
    await userEvent.keyboard('33');
    await expect(cell(root, 4).textContent).toBe('33');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [{ n: 32 }, { n: 33 }] },
    });
  },
};

/** Find the rule (ALG.02.t4 seed 2): 15, 25, 35 grow by 10 each time. */
export const RuleTablet: Story = {
  args: { config: rule, tier: 'abstract' },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, rule.sequence);
    await userEvent.keyboard('10');
    await expect(root.querySelector('.ni-pattern__answer')?.textContent).toBe('10');
    await expectFitsArea(areaBox(canvasElement), [...padKeys(root), check(root)], 'g1-up');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 10 });
  },
};

/** An input–output table: type the missing outputs (5, 6), answered in order. */
export const TableOutputs: Story = {
  args: { config: table, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cells = [...root.querySelectorAll('td')].map((td) => td.textContent);
    await expect(cells).toEqual(['1', '3', '2', '4', '3', '', '4', '']);
    await userEvent.keyboard('5');
    await userEvent.click(blanks(root)[1] as HTMLElement);
    await userEvent.keyboard('6');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [5, 6] });
  },
};

/** Translate: rebuild shell, shell, fish with shapes. Any one-to-one renaming is correct. */
export const TranslateShapes: Story = {
  args: { config: translate, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const [, blue, yellow] = units(root) as [HTMLElement, HTMLElement, HTMLElement];
    for (const [i, unit] of [blue, blue, yellow, blue, blue, yellow].entries()) {
      await userEvent.click(unit);
      await userEvent.click(cell(root, i, 'new'));
    }
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [bSquare, bSquare, yTriangle, bSquare, bSquare, yTriangle] },
    });
  },
};

/** A growing tile pattern: 1, 3, 5 squares; build the next with one more (7). */
export const GrowingTiles: Story = {
  args: { config: tiles, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, tiles.sequence);
    const more = within(root).getByRole('button', { name: 'One more' });
    for (let i = 0; i < 7; i += 1) await userEvent.click(more);
    await expect(cell(root, 3).querySelectorAll('.ni-pattern__tile')).toHaveLength(7);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [{ tiles: 7 }] },
    });
  },
};

/** Portrait (746 × 812), K: the strip and the pieces fit. */
export const PortraitK: Story = {
  globals: { ageMode: 'k' },
  args: { config: shapesExtend, tier: 'pictorial' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...units(root), check(root)],
      'k',
    );
  },
};

/** `disabled`: nothing takes input. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(check(root)).toBeDisabled();
    for (const u of units(root)) await expect(u).toHaveAttribute('aria-disabled', 'true');
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3), the ALG.01.t2 solution: Pip places each missing unit. */
export const DemoMode: Story = {
  args: { config: shapesExtend, disabled: true, demo: demoController, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { index: 0 } });
    await demoController.play({ op: 'place-token', args: { index: 6, token: rCircle } });
    await demoController.play({ op: 'place-token', args: { index: 7, token: bSquare } });
    await waitFor(() =>
      expect(cell(root, 7).querySelector('[data-shape]')?.getAttribute('data-shape')).toBe(
        'square',
      ),
    );
    await expect(demoController.play({ op: 'raise-bar' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const coreDemo: WidgetDemo = createDemoController({ strict: true });

/** `bracket-core`: the band grows over the part that repeats (ALG.04.t1). */
export const DemoBracketCore: Story = {
  args: { config: objectsCore, disabled: true, demo: coreDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await coreDemo.play({ op: 'bracket-core', args: { from: 0, to: 3 } });
    await waitFor(() => expect(root.querySelectorAll('[data-core]')).toHaveLength(4));
  },
};

const ruleDemo: WidgetDemo = createDemoController({ strict: true });

/** `answer {value}`: Pip types the rule on the pad. */
export const DemoAnswerRule: Story = {
  args: { config: rule, disabled: true, demo: ruleDemo, tier: 'abstract' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await ruleDemo.play({ op: 'answer', args: { value: 10 } });
    await waitFor(() => expect(root.querySelector('.ni-pattern__answer')?.textContent).toBe('10'));
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the blank to fill (and the piece rings). */
export const Invite: Story = {
  args: { config: shapesFill, demo: inviteController, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await inviteController.invite({ op: 'place-token', args: { index: 5, token: ySquare } });
    const blank = cell(root, 5);
    await waitFor(() => expect(blank).toHaveClass('ni-invite'));
    await expect(units(root)[0]).toHaveClass('ni-invite');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, blank, root);
    await inviteController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
  },
};
