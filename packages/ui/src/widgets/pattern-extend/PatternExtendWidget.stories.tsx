import type { PatternToken, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  areaBox,
  expectFitsArea,
  expectNumeralsReadable,
  expectOneInvite,
  inArea,
  namedStory,
} from '../../test-support/chartArea';
import { center, clearSpies, pointerDrag, spyAudio } from '../../test-support/storyHelpers';
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
 * named by template and seed; translations and growing tiles (ALG.10) are hand-made (no generator
 * yet, K02). Every config passes the engine model's schema (the `namedStory` decorator), and the
 * stress stories show the model's bounds in the smallest area at kindergarten sizes.
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

/** Kindergarten content: a short ABB pattern with one gap → blue circle. */
const shapesFillK: Config = {
  format: 'pattern-extend',
  sequence: [ySquare, bCircle, bCircle, ySquare, null, bCircle],
  palette: [ySquare, bCircle],
  mode: 'fill',
  kind: 'repeat',
};

/** Kindergarten content: ABB twice → the core is places 1–3. */
const objectsCoreK: Config = {
  format: 'pattern-extend',
  sequence: [shell, fish, fish, shell, fish, fish],
  palette: [shell, fish],
  mode: 'core',
  kind: 'repeat',
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
  decorators: [namedStory],
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
const padKeys = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-pad .ni-pad__key'),
];

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
 * K at the 960 × 600 minimum, a short ABB pattern with one gap: touch-drag the blue circle into
 * it. A wrong piece is taken off again by tapping the filled blank (its name is spoken).
 */
export const ShapesFillTouchKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: shapesFillK, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, shapesFillK.sequence);
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...units(root), check(root)],
      'k',
    );
    const [square, circle] = units(root) as [HTMLElement, HTMLElement];
    await pointerDrag(square, center(cell(root, 4)), 'touch');
    await expect(cell(root, 4).querySelector('[data-shape]')?.getAttribute('data-shape')).toBe(
      'square',
    );
    clearSpies(audio);
    await userEvent.click(cell(root, 4));
    await expect(cell(root, 4)).toHaveAttribute('data-empty', 'true');
    await expect(audio.say).toHaveBeenCalledWith('shape.square.one', undefined);
    await expect(check(root)).toBeDisabled();
    await pointerDrag(circle, center(cell(root, 4)), 'touch');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [{ sprite: 'circle', color: 'blue' }] },
    });
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds).toContain('undo:blank-4');
    await expect(kinds.filter((k) => k.startsWith('drop:'))).toHaveLength(2);
  },
};

/**
 * Undo where the piece sits, by keyboard, and never at the cost of a placement: Enter on a filled
 * blank with nothing picked up takes the piece off, and so does Backspace; with a piece picked
 * up, the same blank takes the new piece instead (the tap meant to place is not an undo).
 */
export const UndoWhereItSits: Story = {
  args: { config: shapesExtend, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const [red, blue] = units(root) as [HTMLElement, HTMLElement];
    const shape = (i: number) =>
      cell(root, i).querySelector('[data-shape]')?.getAttribute('data-shape') ?? null;
    await userEvent.click(red);
    await userEvent.click(cell(root, 6));
    await expect(shape(6)).toBe('circle');
    // A piece is picked up: the tap on the filled blank places it there.
    await userEvent.click(blue);
    await userEvent.click(cell(root, 6));
    await expect(shape(6)).toBe('square');
    // Nothing picked up: Enter takes the piece off, and the blank can be filled again.
    cell(root, 6).focus();
    await expect(cell(root, 6)).not.toHaveAttribute('aria-disabled');
    await userEvent.keyboard('{Enter}');
    await expect(cell(root, 6)).toHaveAttribute('data-empty', 'true');
    await userEvent.click(red);
    await userEvent.click(cell(root, 6));
    cell(root, 6).focus();
    await userEvent.keyboard('{Backspace}');
    await expect(cell(root, 6)).toHaveAttribute('data-empty', 'true');
    await expect(check(root)).toBeDisabled();
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds.filter((k) => k === 'undo:blank-6')).toHaveLength(2);
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
 * K, find the core at the 960 × 600 minimum: shell, fish, fish twice. Tap the first unit, then
 * the third: a band marks places 1–3; Check answers them.
 */
export const CoreTapKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: objectsCoreK },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, objectsCoreK.sequence);
    await expectFitsArea(areaBox(canvasElement), [...shownCells(root), check(root)], 'k');
    await userEvent.click(cell(root, 0));
    await expect(cell(root, 0)).toHaveAttribute('data-pending', 'true');
    await userEvent.click(cell(root, 2));
    await expect(
      [...root.querySelectorAll('[data-core]')].map((e) => e.getAttribute('data-index')),
    ).toEqual(['0', '1', '2']);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [0, 1, 2] },
    });
  },
};

/**
 * The band is undone where it sits, and any whole repeat is the core (ALG.04.t1 seed 1, AABB):
 * a tap on the band takes it off (Check has nothing to send); marking the second repeat, places
 * 5–8, answers the same core as the first.
 */
export const CoreBandUndoAndSecondRepeat: Story = {
  args: { config: objectsCore },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const band = () =>
      [...root.querySelectorAll('[data-core]')].map((e) => e.getAttribute('data-index'));
    await userEvent.click(cell(root, 0));
    await userEvent.click(cell(root, 3));
    await expect(band()).toEqual(['0', '1', '2', '3']);
    await userEvent.click(cell(root, 2));
    await expect(band()).toEqual([]);
    await expect(check(root)).toBeDisabled();
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toContain('undo:tok-2');
    await userEvent.click(cell(root, 4));
    await userEvent.click(cell(root, 7));
    await expect(band()).toEqual(['4', '5', '6', '7']);
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
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await inviteController.invite({ op: 'place-token', args: { index: 5, token: ySquare } });
    const blank = cell(root, 5);
    await waitFor(() => expect(blank).toHaveClass('ni-invite'));
    await expect(units(root)[0]).not.toHaveClass('ni-invite');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, blank, root);
    // One invited control, one ring inside it; the story ends with Pip's hand visible under it.
    await expectOneInvite(root);
  },
};

const clearController: WidgetDemo = createDemoController({ strict: true });

/** Clearing an invite (`invite(null)`) takes Pip's hand and the ring away. */
export const InviteCleared: Story = {
  args: { config: shapesFill, demo: clearController, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await clearController.invite({ op: 'place-token', args: { index: 5, token: ySquare } });
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    await clearController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    await expect(root.querySelector('.ni-invite')).toBeNull();
  },
};

// ---------- stress states (06 §1, §2: nothing clips or scrolls) ----------

/** AABB three times: twelve units to mark the core in. */
const longCore: Config = {
  format: 'pattern-extend',
  sequence: [shell, shell, fish, fish, shell, shell, fish, fish, shell, shell, fish, fish],
  palette: [shell, fish],
  mode: 'core',
  kind: 'repeat',
};

const stressCore =
  (age: 'k' | 'g1-up') =>
  async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: { onResponse: unknown };
  }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, longCore.sequence);
    // Pattern units are one size, the pieces and the strip alike (true relative scale).
    const sizes = new Set(shownCells(root).map((c) => Math.round(c.getBoundingClientRect().width)));
    await expect(sizes.size).toBe(1);
    await expectFitsArea(areaBox(canvasElement), [...shownCells(root), check(root)], age);
    await userEvent.click(cell(root, 0));
    await userEvent.click(cell(root, 3));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [0, 1, 2, 3] },
    });
  };

/** Stress, K: twelve units at the tablet area. */
export const StressLongCoreKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: longCore },
  render: inArea('tablet'),
  play: stressCore('k'),
};

/** Stress, K: twelve units at the 960 × 600 minimum. */
export const StressLongCoreKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: longCore },
  render: inArea('landscapeMin'),
  play: stressCore('k'),
};

/** Pieces and pattern units are drawn at one size (true relative scale), numerals ≥ 32 px. */
export const PiecesMatchPatternScale: Story = {
  args: { config: shapesExtend, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const width = (el: Element) => Math.round(el.getBoundingClientRect().width);
    const art = (el: Element) => el.querySelector('svg') as SVGElement;
    const sizes = new Set([...shownCells(root), ...units(root)].map((c) => width(art(c))));
    await expect(sizes.size).toBe(1);
    await expectNumeralsReadable(root);
  },
};

// ---------- the model's bounds, in the smallest area at kindergarten sizes ----------

const crab = { sprite: 'crab' };
const rHexagon = { sprite: 'hexagon', color: 'red' };

/** The longest pattern with the most blanks and the fullest palette: 12 places, 4 blanks, 4 units. */
const longestExtend: Config = {
  format: 'pattern-extend',
  sequence: [fish, leaf, shell, crab, fish, leaf, shell, crab, null, null, null, null],
  palette: [fish, leaf, shell, crab],
  mode: 'extend',
  kind: 'repeat',
};

/** Stress at the bound, K, 960 × 600: twelve places, four blanks, four pieces; every one fits. */
export const StressLongestExtendKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: longestExtend },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, longestExtend.sequence);
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...units(root), check(root)],
      'k',
    );
    for (const [k, unit] of units(root).entries()) {
      await userEvent.click(unit);
      await userEvent.click(cell(root, 8 + k));
    }
    // All blanks are filled: Check is live, and a filled blank still gives its piece back.
    await expect(check(root)).toBeEnabled();
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...units(root), check(root)],
      'k',
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [fish, leaf, shell, crab] },
    });
  },
};

/** The longest number pattern with the largest numbers: six places of three digits. */
const longestNumbers: Config = {
  format: 'pattern-extend',
  sequence: [{ n: 400 }, { n: 500 }, { n: 600 }, { n: 700 }, null, null],
  palette: [],
  mode: 'extend',
  kind: 'number',
};

/** Six three-digit places and the two typed terms stay inside their cells and the area. */
const typeTheTerms =
  (config: Config, typed: [number, number], age: 'k' | 'g1-up') =>
  async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: { onResponse: unknown };
  }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, config.sequence);
    await userEvent.keyboard(String(typed[0]));
    await userEvent.click(cell(root, 5));
    await userEvent.keyboard(String(typed[1]));
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...padKeys(root), check(root)],
      age,
    );
    for (const n of root.querySelectorAll<HTMLElement>('.ni-pattern__numeral')) {
      const box = (n.closest('.ni-pattern__cell') as HTMLElement).getBoundingClientRect();
      const text = n.getBoundingClientRect();
      await expect(text.left).toBeGreaterThanOrEqual(box.left);
      await expect(text.right).toBeLessThanOrEqual(box.right);
    }
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [{ n: typed[0] }, { n: typed[1] }] },
    });
  };

/**
 * Stress at the bound, 960 × 600: six three-digit places above the two-row pad; the next terms
 * (800, 900) are typed and are the right ones.
 */
export const StressLongestNumbersLandscapeMin: Story = {
  args: { config: longestNumbers, tier: 'abstract' },
  render: inArea('landscapeMin'),
  play: typeTheTerms(longestNumbers, [800, 900], 'g1-up'),
};

/** Kindergarten numbers at the same bound: 5, 6, 7, 8 and the next two (9, 10). */
const countOn: Config = {
  format: 'pattern-extend',
  sequence: [{ n: 5 }, { n: 6 }, { n: 7 }, { n: 8 }, null, null],
  palette: [],
  mode: 'extend',
  kind: 'number',
};

/** K, 960 × 600: six places of counting numbers above the two-row pad at kindergarten sizes. */
export const CountOnKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: countOn, tier: 'abstract' },
  render: inArea('landscapeMin'),
  play: typeTheTerms(countOn, [9, 10], 'k'),
};

/** The longest rule pattern: six numbers growing by 150. */
const longestRule: Config = {
  format: 'pattern-extend',
  sequence: [{ n: 100 }, { n: 250 }, { n: 400 }, { n: 550 }, { n: 700 }, { n: 850 }],
  palette: [],
  mode: 'rule',
  kind: 'number',
};

/** Stress at the bound, 960 × 600: the rule's answer box sits beside the two-row pad. */
export const StressLongestRuleLandscapeMin: Story = {
  args: { config: longestRule, tier: 'abstract' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, longestRule.sequence);
    await userEvent.keyboard('150');
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...padKeys(root), check(root)],
      'g1-up',
      [root.querySelector('.ni-pattern__answer') as HTMLElement],
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 150 });
  },
};

/** The longest translation: six places of four units, rebuilt with four new units. */
const longestTranslate: Config = {
  format: 'pattern-extend',
  sequence: [fish, leaf, shell, crab, fish, leaf],
  palette: [fish, leaf, shell, crab],
  mode: 'translate',
  kind: 'repeat',
  translateTo: [rCircle, bSquare, yTriangle, rHexagon],
};

/** Stress at the bound, K, 960 × 600: the pattern, the new row and four pieces all fit. */
export const StressLongestTranslateKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: longestTranslate, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(
      areaBox(canvasElement),
      [...shownCells(root), ...blanks(root), ...units(root), check(root)],
      'k',
    );
    const [a, b, c, d] = units(root) as HTMLElement[];
    for (const [i, unit] of [a, b, c, d, a, b].entries()) {
      await userEvent.click(unit as HTMLElement);
      await userEvent.click(cell(root, i, 'new'));
    }
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [rCircle, bSquare, yTriangle, rHexagon, rCircle, bSquare] },
    });
  },
};

/** The biggest stacks: 5, 10, 15 tiles → build 20 (MAX_TILES). */
const tallestTiles: Config = {
  format: 'pattern-extend',
  sequence: [{ tiles: 5 }, { tiles: 10 }, { tiles: 15 }, null],
  palette: [],
  mode: 'extend',
  kind: 'grow',
};

/**
 * Stress at the bound, K, 960 × 600: the biggest stack (20 tiles), which is also this pattern's
 * answer. Reaching it is a state the child can read: one-more goes off and "That is the biggest
 * one." is shown and spoken. Nothing is ringed (a cue on one-less would steer the child off the
 * answer); one-less and Check stay live (`BiggestTilesLeave` takes one off again).
 */
export const StressBiggestTilesKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tallestTiles, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await expectShowsSequence(root, tallestTiles.sequence);
    const more = within(root).getByRole('button', { name: 'One more' });
    const less = within(root).getByRole('button', { name: 'One less' });
    for (let i = 0; i < 20; i += 1) await userEvent.click(more);
    await expect(cell(root, 3).querySelectorAll('.ni-pattern__tile')).toHaveLength(20);
    await expect(more).toBeDisabled();
    const note = () => root.querySelector<HTMLElement>('.ni-pattern__note');
    await expect(note()).toHaveTextContent('That is the biggest one.');
    await expect(note()).toHaveAttribute('role', 'status');
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.pattern.biggest', undefined);
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(less).toBeEnabled();
    await expect(check(root)).toBeEnabled();
    await expectFitsArea(areaBox(canvasElement), [...shownCells(root), less, check(root)], 'k', [
      note() as HTMLElement,
    ]);
    // Every tile of the biggest stack can be seen and counted (at least 8 px each).
    for (const tile of cell(root, 3).querySelectorAll('.ni-pattern__tile')) {
      await expect(tile.getBoundingClientRect().width).toBeGreaterThanOrEqual(8);
    }
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { tokens: [{ tiles: 20 }] },
    });
  },
};

/** Leaving the biggest stack: one-less takes the line away, and one-more is back. */
export const BiggestTilesLeave: Story = {
  args: { config: tallestTiles, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const more = within(root).getByRole('button', { name: 'One more' });
    const less = within(root).getByRole('button', { name: 'One less' });
    for (let i = 0; i < 20; i += 1) await userEvent.click(more);
    await expect(root.querySelector('.ni-pattern__note')).not.toBeNull();
    await userEvent.click(less);
    await expect(cell(root, 3).querySelectorAll('.ni-pattern__tile')).toHaveLength(19);
    await expect(root.querySelector('.ni-pattern__note')).toBeNull();
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(more).toBeEnabled();
  },
};

// ---------- review round 1 (PR #102) ----------

/**
 * An erased rule is erased: type 10, press Backspace twice, and the display is empty, Check is
 * off and sends nothing.
 */
export const RuleErased: Story = {
  args: { config: rule, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.keyboard('10');
    await expect(check(root)).toBeEnabled();
    await userEvent.keyboard('{Backspace}');
    await expect(root.querySelector('.ni-pattern__answer')?.textContent).toBe('1');
    await userEvent.keyboard('{Backspace}');
    await expect(root.querySelector('.ni-pattern__answer')?.textContent).toBe('');
    await expect(check(root)).toBeDisabled();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

/**
 * Backspace and Delete undo whatever is in hand: Delete on a filled blank while another piece is
 * picked up takes the placed piece off (Enter would place the held one), and Backspace on a
 * marked place takes the core band off. One undo each in the trace.
 */
export const EraseKeysUndo: Story = {
  args: { config: shapesExtend, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const [red, blue] = units(root) as [HTMLElement, HTMLElement];
    await userEvent.click(red);
    await userEvent.click(cell(root, 6));
    await userEvent.click(blue);
    cell(root, 6).focus();
    await userEvent.keyboard('{Delete}');
    await expect(cell(root, 6)).toHaveAttribute('data-empty', 'true');
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds.filter((k) => k === 'undo:blank-6')).toHaveLength(1);
  },
};

/** Backspace on a marked place takes the core band off (one undo in the trace). */
export const EraseKeyTakesTheBandOff: Story = {
  args: { config: objectsCore },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cell(root, 0));
    await userEvent.click(cell(root, 3));
    await expect(root.querySelectorAll('[data-core]')).toHaveLength(4);
    cell(root, 1).focus();
    await userEvent.keyboard('{Backspace}');
    await expect(root.querySelectorAll('[data-core]')).toHaveLength(0);
    await expect(check(root)).toBeDisabled();
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds.filter((k) => k.startsWith('undo:'))).toEqual(['undo:tok-1']);
  },
};
